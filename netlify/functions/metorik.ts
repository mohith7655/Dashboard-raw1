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
import { buildWooMetrics, deriveWoo, metric, round2, type WooTotals } from '../../src/lib/derive'
import { eachDay, previousRange } from '../../src/lib/dateRange'
import type { CouponType, CouponsPayload, CustomerSegment, CustomersPayload, ProductsPayload } from '../../src/lib/data/types'
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

const API_BASE = 'https://app.metorik.com/api/v1/store'
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
    const range = clampToAvailableData(readRange(url))
    const apiKey = requireEnv('METORIK_API_KEY')
    const timeZone = await storeTimeZone(apiKey)

    const resource = url.searchParams.get('resource')
    if (resource === 'orders') {
      return json(await loadOrdersPage(apiKey, range, url, timeZone))
    }
    if (resource === 'customers') {
      return json(await loadCustomersPage(apiKey, range, url, timeZone))
    }
    if (resource === 'products') {
      return json(await loadProductsPage(apiKey, range, url))
    }
    if (resource === 'coupons') {
      return json(await loadCouponsPage(apiKey, range, url))
    }
    return json(await loadMetrics(apiKey, range, timeZone))
  } catch (err) {
    return toErrorResponse(err, HINT)
  }
}

/** Metorik accepts completed reporting days only, so protect direct URL calls too. */
function clampToAvailableData(range: DateRange): DateRange {
  const latest = new Date()
  latest.setUTCHours(0, 0, 0, 0)
  latest.setUTCDate(latest.getUTCDate() - 1)
  const maxDate = latest.toISOString().slice(0, 10)
  const start = range.start > maxDate ? maxDate : range.start
  const end = range.end > maxDate ? maxDate : range.end
  return start <= end ? { ...range, start, end } : { ...range, start: maxDate, end: maxDate }
}

/* ------------------------------------------------------------------ *
 * Store timezone
 *
 * Metorik resolves every date filter against the store's own timezone but
 * returns timestamps in UTC. Bucketing those UTC strings by their leading ten
 * characters pushes late-evening orders onto the following day, which drops
 * them off the end of the selected range. Every timestamp is therefore
 * converted back to store-local time before it is bucketed or displayed.
 * ------------------------------------------------------------------ */

let cachedTimeZone: Promise<string> | null = null

function storeTimeZone(apiKey: string): Promise<string> {
  cachedTimeZone ??= metorik(apiKey, '', {})
    .then((body) => (typeof body.timezone === 'string' && body.timezone ? body.timezone : 'UTC'))
    .catch(() => {
      // A failed lookup is never cached — one blip would otherwise pin the
      // whole warm instance to UTC and quietly shift every date by a day.
      cachedTimeZone = null
      return 'UTC'
    })
  return cachedTimeZone
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone)
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      })
    } catch {
      formatter = formatterFor('UTC')
    }
    formatters.set(timeZone, formatter)
  }
  return formatter
}

/** `2026-07-26T06:32:31Z` in `America/Los_Angeles` → `2026-07-25T23:32:31`. */
function toStoreTime(iso: string, timeZone: string): string {
  const ms = Date.parse(iso)
  if (!iso || !Number.isFinite(ms)) return iso
  const parts: Record<string, string> = {}
  for (const part of formatterFor(timeZone).formatToParts(new Date(ms))) {
    parts[part.type] = part.value
  }
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`
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
  hasMore: boolean
}

function readPage(body: Record<string, unknown>): MetorikPage {
  const rows = asArray(body.data).filter(isRecord)
  const pagination = isRecord(body.pagination) ? body.pagination : {}
  return {
    rows,
    total: num(pagination.total) || rows.length,
    hasMore: pagination.has_more_pages === true,
  }
}

function firstString(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return ''
}

function appendParam(
  params: Record<string, string>,
  url: URL,
  key: string,
  targetKey = key,
): void {
  const value = url.searchParams.get(key)
  if (value !== null && value !== '') params[targetKey] = value
}

function customerSortField(field: string): string {
  switch (field) {
    case 'name':
      return 'full_name'
    case 'orders':
      return 'order_count'
    case 'ltv':
      return 'total_spent'
    case 'firstOrder':
      return 'first_order_date'
    case 'lastOrder':
      return 'last_order_date'
    case 'email':
      return 'email'
    default:
      return field
  }
}

function productSortField(field: string): string {
  switch (field) {
    case 'name':
      return 'title'
    case 'qtySold':
      return 'net_items_sold'
    case 'orders':
      return 'net_orders'
    case 'avgPrice':
      return 'net_sales'
    case 'refunded':
      return 'total_refunds'
    case 'stock':
      return 'stock_quantity'
    case 'revenue':
      return 'net_sales'
    default:
      return field
  }
}

function couponSortField(field: string): string {
  switch (field) {
    case 'code':
      return 'code'
    case 'amount':
      return 'amount'
    case 'used':
      return 'usage_count'
    case 'discount':
      return 'total_discounted'
    case 'revenue':
      return 'sales_generated'
    default:
      return field
  }
}

function customerRow(
  row: Record<string, unknown>,
  timeZone: string,
): CustomersPayload['rows'][number] {
  const orderCount = Math.max(0, Math.round(num(row.order_count)))
  const ltv = round2(num(row.total_spent))
  const lastOrderRaw = String(row.last_order_date ?? row.customer_updated_at ?? '')
  const lastOrder = toStoreTime(lastOrderRaw, timeZone)
  const oldEnough =
    lastOrderRaw &&
    Date.parse(lastOrderRaw) > 0 &&
    Date.now() - Date.parse(lastOrderRaw) > 180 * 86_400_000

  let segment: CustomerSegment = 'returning'
  if (orderCount <= 1) {
    segment = 'new'
  } else if (ltv >= 1000 || orderCount >= 10) {
    segment = 'vip'
  } else if (oldEnough) {
    segment = 'at-risk'
  }

  return {
    // Guest checkouts all report `customer_id: 0`, so Metorik's own id leads.
    id: String(row.metorik_customer_id ?? row.customer_id ?? row.id ?? row.email ?? ''),
    name: readCustomerName(row) || readCustomerEmail(row) || 'Guest',
    email: readCustomerEmail(row),
    orders: orderCount,
    ltv,
    aov: round2(num(row.average_order)),
    firstOrder: toStoreTime(String(row.first_order_date ?? row.customer_created_at ?? ''), timeZone),
    lastOrder,
    city: firstString(row, ['billing_address_city', 'shipping_address_city']),
    country: firstString(row, ['billing_address_country', 'shipping_address_country']),
    segment,
  }
}

function productRow(row: Record<string, unknown>): ProductsPayload['rows'][number] {
  const stock = Math.round(num(row.stock_quantity))
  const inStock = row.in_stock !== false
  return {
    id: String(row.product_id ?? row.id ?? row.sku ?? row.title ?? ''),
    name: String(row.title ?? row.name ?? ''),
    sku: String(row.sku ?? ''),
    qtySold: Math.max(0, Math.round(num(row.net_items_sold ?? row.gross_items_sold))),
    revenue: round2(num(row.net_sales ?? row.gross_sales)),
    orders: Math.max(0, Math.round(num(row.net_orders))),
    avgPrice: round2(
      num(row.net_items_sold) > 0
        ? num(row.net_sales) / num(row.net_items_sold)
        : num(row.current_price ?? row.regular_price ?? row.sale_price),
    ),
    refunded: round2(num(row.total_refunds)),
    stock,
    stockStatus: !inStock || stock <= 0 ? 'out-of-stock' : stock <= 5 ? 'low-stock' : 'in-stock',
  }
}

function couponRow(row: Record<string, unknown>): CouponsPayload['rows'][number] {
  const type = String(row.discount_type ?? 'fixed_cart') as CouponType
  return {
    id: String(row.coupon_id ?? row.id ?? row.code ?? ''),
    code: String(row.code ?? ''),
    type: type === 'percent' || type === 'fixed_cart' || type === 'fixed_product' ? type : 'fixed_cart',
    amount: round2(num(row.amount)),
    used: Math.max(0, Math.round(num(row.usage_count))),
    usageLimit: null,
    revenue: round2(num(row.sales_generated)),
    discount: round2(num(row.total_discounted)),
    expires: typeof row.date_expires === 'string' && row.date_expires ? row.date_expires : null,
  }
}

async function collectAllRows(
  apiKey: string,
  path: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = await metorik(apiKey, path, { ...params, page: String(page), per_page: '100' })
    const parsed = readPage(body)
    rows.push(...parsed.rows)
    if (!parsed.hasMore || parsed.rows.length === 0) break
  }
  return rows
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

function normaliseOrder(row: Record<string, unknown>, timeZone: string): Order {
  const number = String(row.order_number ?? row.number ?? row.id ?? '').replace(/^#/, '')
  const email = readCustomerEmail(row)
  return {
    id: String(row.order_id ?? row.id ?? number),
    number,
    date: toStoreTime(String(row.order_created_at ?? row.date_created ?? row.date ?? ''), timeZone),
    customer: readCustomerName(row) || email || 'Guest',
    email,
    city: firstString(row, ['billing_address_city', 'shipping_address_city']),
    country: firstString(row, ['billing_address_country', 'shipping_address_country']),
    status: readStatus(row.status),
    items: Math.round(pick(row, ['total_items', 'items_count', 'line_items_count', 'quantity'])),
    total: round2(pick(row, ['total'])),
  }
}

/**
 * Orders carry the buyer as flat `billing_address_*` / `shipping_address_*`
 * fields; customers carry `full_name`. Both shapes are read here so neither
 * falls through to "Guest" while a real name is sitting in the payload.
 */
function readCustomerName(row: Record<string, unknown>): string {
  const direct = firstString(row, ['full_name', 'customer_name', 'order_name'])
  if (direct) return direct

  const billing = isRecord(row.billing) ? row.billing : {}
  const shipping = isRecord(row.shipping) ? row.shipping : {}
  const pairs: [unknown, unknown][] = [
    [row.billing_address_first_name, row.billing_address_last_name],
    [row.shipping_address_first_name, row.shipping_address_last_name],
    [row.first_name, row.last_name],
    [billing.first_name, billing.last_name],
    [shipping.first_name, shipping.last_name],
  ]
  for (const [first, last] of pairs) {
    const name = `${String(first ?? '')} ${String(last ?? '')}`.trim()
    if (name) return name
  }
  return ''
}

function readCustomerEmail(row: Record<string, unknown>): string {
  const billing = isRecord(row.billing) ? row.billing : {}
  const direct = firstString(row, ['email', 'billing_address_email', 'customer_email'])
  if (direct) return direct
  return typeof billing.email === 'string' ? billing.email : ''
}

/* ------------------------------------------------------------------ *
 * Orders table — one page, fetched from upstream as one page
 * ------------------------------------------------------------------ */

async function loadOrdersPage(
  apiKey: string,
  range: DateRange,
  url: URL,
  timeZone: string,
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
  const [body, totals] = await Promise.all([
    metorik(apiKey, '/orders', {
      ...dateFilter(range),
      page: String(page),
      per_page: String(perPage),
      order_by: field === 'date_created' ? 'order_created_at' : field,
      order_dir: directionParam,
    }),
    metorik(apiKey, '/orders/totals', dateFilter(range)),
  ])

  const parsed = readPage(body)
  const totalData = isRecord(totals.data) ? totals.data : {}
  return {
    orders: parsed.rows.map((row) => normaliseOrder(row, timeZone)),
    total: num(totalData.count) || parsed.total,
    page,
    perPage,
  }
}

const clamp = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, n))

interface MetorikFilter {
  field: string
  operator: string
  value: unknown
}

/**
 * The only date scoping Metorik honours on `/orders` and `/customers` is the
 * `filters` array — `start_date`/`end_date` are ignored there and the whole
 * store comes back. Any caller-supplied filters are merged in rather than
 * overwritten.
 */
function withFilters(base: MetorikFilter[], url?: URL): Record<string, string> {
  const extra = url?.searchParams.get('filters')
  let merged = base
  if (extra) {
    try {
      const parsed: unknown = JSON.parse(extra)
      if (Array.isArray(parsed)) merged = [...base, ...(parsed as MetorikFilter[])]
    } catch {
      throw new BadRequest('`filters` must be a JSON array')
    }
  }
  return { filters: JSON.stringify(merged) }
}

const dateFilter = (range: DateRange): Record<string, string> =>
  withFilters([
    { field: 'order_created_at', operator: 'between', value: [range.start, range.end] },
  ])

/** Customers whose most recent order falls inside the range. */
const lastOrderFilter = (range: DateRange, url?: URL): Record<string, string> =>
  withFilters(
    [{ field: 'last_order_date', operator: 'between', value: [range.start, range.end] }],
    url,
  )

/** Customers whose first ever order falls inside the range. */
const firstOrderFilter = (range: DateRange, url?: URL): Record<string, string> =>
  withFilters(
    [{ field: 'first_order_date', operator: 'between', value: [range.start, range.end] }],
    url,
  )

/* ------------------------------------------------------------------ *
 * Metrics — every order in the range, aggregated here
 * ------------------------------------------------------------------ */

interface Aggregate extends WooTotals {
  byDay: Map<string, number>
  byStatus: Map<OrderStatus, number>
  bySource: Map<string, number>
  orderCount: number
}

async function loadMetrics(
  apiKey: string,
  range: DateRange,
  timeZone: string,
): Promise<WooMetrics> {
  const prev = previousRange(range)
  const [current, previousAgg, newCustomers, prevCustomers] = await Promise.all([
    aggregate(apiKey, range, timeZone),
    aggregate(apiKey, prev, timeZone),
    countNewCustomers(apiKey, range),
    countNewCustomers(apiKey, prev),
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

async function loadCustomersPage(
  apiKey: string,
  range: DateRange,
  url: URL,
  timeZone: string,
): Promise<CustomersPayload> {
  const page = Math.max(1, Math.round(num(url.searchParams.get('page')) || 1))
  const perPage = clamp(Math.round(num(url.searchParams.get('perPage')) || 25), 1, 100)
  const sortParam = customerSortField(url.searchParams.get('sort') ?? 'ltv')
  const directionParam = url.searchParams.get('direction') ?? 'desc'
  if (directionParam !== 'asc' && directionParam !== 'desc') {
    throw new BadRequest('`direction` must be `asc` or `desc`')
  }

  const rangeFilter = lastOrderFilter(range, url)
  const currentParams: Record<string, string> = {
    ...rangeFilter,
    page: String(page),
    per_page: String(perPage),
    order_by: sortParam,
    order_dir: directionParam,
  }
  appendParam(currentParams, url, 'search')
  appendParam(currentParams, url, 'segment')
  appendParam(currentParams, url, 'custom_fields')

  const totalsParams: Record<string, string> = { ...rangeFilter }
  appendParam(totalsParams, url, 'search')
  appendParam(totalsParams, url, 'segment')

  const [body, totals] = await Promise.all([
    metorik(apiKey, '/customers', currentParams),
    metorik(apiKey, '/customers/totals', totalsParams),
  ])

  const parsed = readPage(body)
  const data = isRecord(totals.data) ? totals.data : {}
  const totalCustomers = num(data.count) || parsed.total
  const returningCustomers = num(data.returning_customers)
  const averageLtv = num(data.average_ltv)

  return {
    rows: parsed.rows.map((row) => customerRow(row, timeZone)),
    total: totalCustomers,
    page,
    perPage,
    totalCustomers: metric(totalCustomers, null),
    newCustomers: metric(Math.max(0, totalCustomers - returningCustomers), null),
    returningRate: metric(totalCustomers > 0 ? returningCustomers / totalCustomers : 0, null),
    avgLtv: metric(averageLtv, null),
  }
}

interface ProductSummary {
  productsSold: number
  productRevenue: number
  grossSales: number
  refunds: number
}

function productSummary(rows: Record<string, unknown>[]): ProductSummary {
  return rows.reduce<ProductSummary>(
    (acc, row) => {
      acc.productsSold += Math.max(0, num(row.net_items_sold ?? row.gross_items_sold))
      acc.productRevenue += Math.max(0, num(row.net_sales ?? row.gross_sales))
      acc.grossSales += Math.max(0, num(row.gross_sales))
      acc.refunds += Math.max(0, num(row.total_refunds))
      return acc
    },
    { productsSold: 0, productRevenue: 0, grossSales: 0, refunds: 0 },
  )
}

async function loadProductsPage(
  apiKey: string,
  range: DateRange,
  url: URL,
): Promise<ProductsPayload> {
  const page = Math.max(1, Math.round(num(url.searchParams.get('page')) || 1))
  const perPage = clamp(Math.round(num(url.searchParams.get('perPage')) || 25), 1, 100)
  const sortParam = productSortField(url.searchParams.get('sort') ?? 'revenue')
  const directionParam = url.searchParams.get('direction') ?? 'desc'
  if (directionParam !== 'asc' && directionParam !== 'desc') {
    throw new BadRequest('`direction` must be `asc` or `desc`')
  }

  const currentParams: Record<string, string> = {
    start_date: range.start,
    end_date: range.end,
    page: String(page),
    per_page: String(perPage),
    order_by: sortParam,
    order_dir: directionParam,
  }
  appendParam(currentParams, url, 'search')
  appendParam(currentParams, url, 'filters')
  appendParam(currentParams, url, 'order_filters')
  appendParam(currentParams, url, 'custom_fields')

  const summaryParams: Record<string, string> = {
    start_date: range.start,
    end_date: range.end,
    order_by: sortParam,
    order_dir: directionParam,
  }
  appendParam(summaryParams, url, 'search')
  appendParam(summaryParams, url, 'filters')
  appendParam(summaryParams, url, 'order_filters')
  appendParam(summaryParams, url, 'custom_fields')

  const [body, allRows] = await Promise.all([
    metorik(apiKey, '/products', currentParams),
    collectAllRows(apiKey, '/products', summaryParams),
  ])

  const parsed = readPage(body)
  const summary = productSummary(allRows)

  return {
    rows: parsed.rows.map(productRow),
    // `/products` reports no grand total, and falling back to the page length
    // pinned the table to a single page. The summary sweep already holds the
    // whole filtered set, so it is the count.
    total: allRows.length || parsed.total,
    page,
    perPage,
    productsSold: metric(summary.productsSold, null),
    productRevenue: metric(summary.productRevenue, null),
    avgPrice: metric(summary.productsSold > 0 ? summary.productRevenue / summary.productsSold : 0, null),
    refundRate: metric(summary.grossSales > 0 ? summary.refunds / summary.grossSales : 0, null),
  }
}

interface CouponSummary {
  couponsUsed: number
  discountTotal: number
  couponRevenue: number
}

function couponSummary(rows: Record<string, unknown>[]): CouponSummary {
  return rows.reduce<CouponSummary>(
    (acc, row) => {
      acc.couponsUsed += Math.max(0, num(row.usage_count))
      acc.discountTotal += Math.max(0, num(row.total_discounted))
      acc.couponRevenue += Math.max(0, num(row.sales_generated))
      return acc
    },
    { couponsUsed: 0, discountTotal: 0, couponRevenue: 0 },
  )
}

async function loadCouponsPage(
  apiKey: string,
  range: DateRange,
  url: URL,
): Promise<CouponsPayload> {
  const page = Math.max(1, Math.round(num(url.searchParams.get('page')) || 1))
  const perPage = clamp(Math.round(num(url.searchParams.get('perPage')) || 25), 1, 100)
  const sortParam = couponSortField(url.searchParams.get('sort') ?? 'revenue')
  const directionParam = url.searchParams.get('direction') ?? 'desc'
  if (directionParam !== 'asc' && directionParam !== 'desc') {
    throw new BadRequest('`direction` must be `asc` or `desc`')
  }

  const currentParams: Record<string, string> = {
    start_date: range.start,
    end_date: range.end,
    page: String(page),
    per_page: String(perPage),
    order_by: sortParam,
    order_dir: directionParam,
  }
  appendParam(currentParams, url, 'search')
  appendParam(currentParams, url, 'has_usage')
  appendParam(currentParams, url, 'order_filters')

  const summaryParams: Record<string, string> = {
    start_date: range.start,
    end_date: range.end,
    order_by: sortParam,
    order_dir: directionParam,
  }
  appendParam(summaryParams, url, 'search')
  appendParam(summaryParams, url, 'has_usage')
  appendParam(summaryParams, url, 'order_filters')

  const [body, allRows] = await Promise.all([
    metorik(apiKey, '/coupons', currentParams),
    collectAllRows(apiKey, '/coupons', summaryParams),
  ])

  const parsed = readPage(body)
  const summary = couponSummary(allRows)

  return {
    rows: parsed.rows.map(couponRow),
    total: allRows.length || parsed.total,
    page,
    perPage,
    couponsUsed: metric(summary.couponsUsed, null),
    discountTotal: metric(summary.discountTotal, null),
    couponRevenue: metric(summary.couponRevenue, null),
    avgDiscount: metric(summary.couponsUsed > 0 ? summary.discountTotal / summary.couponsUsed : 0, null),
  }
}

async function aggregate(
  apiKey: string,
  range: DateRange,
  timeZone: string,
): Promise<Aggregate> {
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
      const order = normaliseOrder(row, timeZone)
      agg.orderCount++
      agg.byStatus.set(order.status, (agg.byStatus.get(order.status) ?? 0) + 1)
      if (!PAID_STATUSES.has(order.status)) continue

      const day = order.date.slice(0, 10)
      agg.totalOrders++
      agg.totalRevenue += order.total
      agg.byDay.set(day, (agg.byDay.get(day) ?? 0) + order.total)

      agg.productCost += pick(row, ['product_cogs', 'cost_of_goods', 'cogs', 'cost_total'])
      agg.shippingCost += pick(row, ['shipping_cogs', 'shipping_cost', 'shipping_total'])
      agg.transactionCost += pick(row, ['transaction_cogs', 'transaction_fee', 'transaction_fees', 'fees_total'])

      const source = readSource(row)
      if (source) agg.bySource.set(source, (agg.bySource.get(source) ?? 0) + order.total)
    }

    if (!parsed.hasMore || parsed.rows.length === 0) break
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

/**
 * Customers acquired inside the range.
 *
 * `order_start_date`/`order_end_date` only scope the *statistics* on
 * `/customers/totals` — `count` stays at the whole-store customer total no
 * matter what dates are passed, which is why this KPI used to read six figures
 * and never moved. Filtering on `first_order_date` is what actually narrows the
 * customer set.
 */
async function countNewCustomers(apiKey: string, range: DateRange): Promise<number> {
  const body = await metorik(apiKey, '/customers/totals', firstOrderFilter(range))
  const data = isRecord(body.data) ? body.data : {}
  return Math.max(0, num(data.count))
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
