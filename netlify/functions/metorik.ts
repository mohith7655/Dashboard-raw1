import type {
  DateRange,
  Order,
  OrderStatus,
  OrdersPage,
  RevenuePoint,
  SourceRevenue,
  StatusCount,
  WooMetrics,
} from '../../src/lib/types'
import { ORDER_STATUSES } from '../../src/lib/types'
import { buildWooMetrics, deriveWoo, round2, type WooTotals } from '../../src/lib/derive'
import { eachDay, previousRange } from '../../src/lib/dateRange'
import {
  BadRequest,
  asArray,
  isRecord,
  json,
  num,
  readRange,
  requireEnv,
  toErrorResponse,
} from '../lib/http'

const API_BASE = 'https://api.metorik.com/v1'
const HINT =
  'WooCommerce metrics could not be loaded. Check the Metorik API key in your Netlify environment, then click Retry.'

/** Orders that produced revenue. Everything else is counted but not banked. */
const PAID_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  'completed',
  'processing',
])

/** Safety valve on the aggregation loop for very long ranges. */
const MAX_PAGES = 40
const AGGREGATE_PAGE_SIZE = 100

/**
 * Metorik / WooCommerce.
 *
 *   ?start=&end=                      → normalised WooMetrics
 *   ?start=&end=&resource=orders&…    → one page of orders (server-side)
 */
export default async function handler(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url)
    const range = readRange(url)
    const apiKey = requireEnv('METORIK_API_KEY')

    if (url.searchParams.get('resource') === 'orders') {
      return json(await loadOrdersPage(apiKey, range, url))
    }
    return json(await loadMetrics(apiKey, range))
  } catch (err) {
    return toErrorResponse(err, HINT)
  }
}

/* ------------------------------------------------------------------ *
 * Upstream access
 * ------------------------------------------------------------------ */

async function metorik(
  apiKey: string,
  path: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}${path}?${new URLSearchParams(params).toString()}`, {
    headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
  })
  const body: unknown = await res.json().catch(() => null)

  if (!res.ok) {
    const message =
      isRecord(body) && typeof body.message === 'string'
        ? body.message
        : `request failed with status ${res.status}`
    throw new Error(`Metorik API error (${res.status}): ${message}`)
  }
  return isRecord(body) ? body : {}
}

/** Metorik paginates under `data` with totals in `meta`. */
interface MetorikPage {
  rows: Record<string, unknown>[]
  total: number
  lastPage: number
}

function readPage(body: Record<string, unknown>): MetorikPage {
  const rows = asArray(body.data).filter(isRecord)
  const meta = isRecord(body.meta) ? body.meta : {}
  return {
    rows,
    total: num(meta.total) || rows.length,
    lastPage: num(meta.last_page) || 1,
  }
}

/* ------------------------------------------------------------------ *
 * Order normalisation
 * ------------------------------------------------------------------ */

function readStatus(raw: unknown): OrderStatus {
  const value = String(raw ?? '').toLowerCase().replace('wc-', '')
  const match = ORDER_STATUSES.find((s) => s === value)
  // Anything unexpected (pending, draft, …) is counted as on-hold rather than
  // dropped, so order totals always reconcile.
  return match ?? 'on-hold'
}

/** Reads the first field present, so schema differences degrade to 0. */
function pick(row: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return num(row[key])
  }
  return 0
}

function normaliseOrder(row: Record<string, unknown>): Order {
  const number = String(row.number ?? row.id ?? '')
  return {
    id: String(row.id ?? number),
    number,
    date: String(row.date_created ?? row.date ?? ''),
    customer: readCustomerName(row),
    status: readStatus(row.status),
    items: Math.round(pick(row, ['items_count', 'line_items_count', 'quantity'])),
    total: round2(pick(row, ['total'])),
  }
}

function readCustomerName(row: Record<string, unknown>): string {
  if (typeof row.customer_name === 'string' && row.customer_name) return row.customer_name
  const billing = isRecord(row.billing) ? row.billing : {}
  const first = String(billing.first_name ?? '')
  const last = String(billing.last_name ?? '')
  const name = `${first} ${last}`.trim()
  if (name) return name
  return String(row.email ?? billing.email ?? 'Guest')
}

/* ------------------------------------------------------------------ *
 * Orders table — one page, fetched from upstream as one page
 * ------------------------------------------------------------------ */

async function loadOrdersPage(
  apiKey: string,
  range: DateRange,
  url: URL,
): Promise<OrdersPage> {
  const page = Math.max(1, Math.round(num(url.searchParams.get('page')) || 1))
  const perPage = clamp(Math.round(num(url.searchParams.get('perPage')) || 10), 1, 100)

  const sortParam = url.searchParams.get('sort') ?? 'date'
  if (sortParam !== 'date' && sortParam !== 'total') {
    throw new BadRequest('`sort` must be `date` or `total`')
  }
  const directionParam = url.searchParams.get('direction') ?? 'desc'
  if (directionParam !== 'asc' && directionParam !== 'desc') {
    throw new BadRequest('`direction` must be `asc` or `desc`')
  }

  const field = sortParam === 'total' ? 'total' : 'date_created'
  const body = await metorik(apiKey, '/orders', {
    ...dateFilter(range),
    page: String(page),
    per_page: String(perPage),
    order_by: field,
    order: directionParam,
  })

  const parsed = readPage(body)
  return {
    orders: parsed.rows.map(normaliseOrder),
    total: parsed.total,
    page,
    perPage,
  }
}

const clamp = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, n))

const dateFilter = (range: DateRange): Record<string, string> => ({
  date_min: range.start,
  date_max: range.end,
})

/* ------------------------------------------------------------------ *
 * Metrics — every order in the range, aggregated here
 * ------------------------------------------------------------------ */

interface Aggregate extends WooTotals {
  byDay: Map<string, number>
  byStatus: Map<OrderStatus, number>
  bySource: Map<string, number>
  orderCount: number
}

async function loadMetrics(apiKey: string, range: DateRange): Promise<WooMetrics> {
  const prev = previousRange(range)
  const [current, previousAgg, newCustomers, prevCustomers] = await Promise.all([
    aggregate(apiKey, range),
    aggregate(apiKey, prev),
    countCustomers(apiKey, range),
    countCustomers(apiKey, prev),
  ])

  current.newCustomers = newCustomers
  previousAgg.newCustomers = prevCustomers

  return buildWooMetrics(deriveWoo(current), deriveWoo(previousAgg), {
    revenueSeries: toSeries(range, current.byDay),
    ordersByStatus: toStatusCounts(current.byStatus),
    revenueBySource: toSources(current.bySource),
    orderCount: current.orderCount,
  })
}

async function aggregate(apiKey: string, range: DateRange): Promise<Aggregate> {
  const agg: Aggregate = {
    totalRevenue: 0,
    totalOrders: 0,
    newCustomers: 0,
    productCost: 0,
    shippingCost: 0,
    transactionCost: 0,
    byDay: new Map(),
    byStatus: new Map(),
    bySource: new Map(),
    orderCount: 0,
  }

  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = await metorik(apiKey, '/orders', {
      ...dateFilter(range),
      page: String(page),
      per_page: String(AGGREGATE_PAGE_SIZE),
    })
    const parsed = readPage(body)

    for (const row of parsed.rows) {
      const order = normaliseOrder(row)
      agg.orderCount++
      agg.byStatus.set(order.status, (agg.byStatus.get(order.status) ?? 0) + 1)
      if (!PAID_STATUSES.has(order.status)) continue

      const day = order.date.slice(0, 10)
      agg.totalOrders++
      agg.totalRevenue += order.total
      agg.byDay.set(day, (agg.byDay.get(day) ?? 0) + order.total)

      agg.productCost += pick(row, ['cost_of_goods', 'cogs', 'cost_total'])
      agg.shippingCost += pick(row, ['shipping_cost', 'shipping_total'])
      agg.transactionCost += pick(row, ['transaction_fee', 'transaction_fees', 'fees_total'])

      const source = readSource(row)
      if (source) agg.bySource.set(source, (agg.bySource.get(source) ?? 0) + order.total)
    }

    if (page >= parsed.lastPage || parsed.rows.length === 0) break
  }

  agg.totalRevenue = round2(agg.totalRevenue)
  agg.productCost = round2(agg.productCost)
  agg.shippingCost = round2(agg.shippingCost)
  agg.transactionCost = round2(agg.transactionCost)
  return agg
}

/** Paid orders only carry a UTM source; unattributed traffic reads `(direct)`. */
function readSource(row: Record<string, unknown>): string {
  const utm = isRecord(row.utm) ? row.utm : row
  const raw = utm.source ?? utm.utm_source
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  return value || '(direct)'
}

async function countCustomers(apiKey: string, range: DateRange): Promise<number> {
  const body = await metorik(apiKey, '/customers', {
    ...dateFilter(range),
    per_page: '1',
    page: '1',
  })
  return readPage(body).total
}

function toSeries(range: DateRange, byDay: Map<string, number>): RevenuePoint[] {
  // Every calendar day appears, so gaps render as zero rather than vanishing.
  return eachDay(range).map((date) => ({ date, revenue: round2(byDay.get(date) ?? 0) }))
}

function toStatusCounts(byStatus: Map<OrderStatus, number>): StatusCount[] {
  return ORDER_STATUSES.map((status) => ({ status, count: byStatus.get(status) ?? 0 })).filter(
    (s) => s.count > 0,
  )
}

function toSources(bySource: Map<string, number>): SourceRevenue[] {
  return [...bySource.entries()]
    .map(([source, revenue]) => ({ source, revenue: round2(revenue) }))
    .sort((a, b) => b.revenue - a.revenue)
}
