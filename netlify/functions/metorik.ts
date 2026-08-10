import type {
  DateRange,
  MarketRevenue,
  Order,
  OrderStatus,
  OrdersPage,
  ProfitAndLoss,
  RevenueBreakdownRow,
  RevenuePoint,
  ShippingChargedPayload,
  ShippingChargedRow,
  SourceRevenue,
  StatusCount,
  TrafficMetrics,
  TrafficPoint,
  WooMetrics,
} from '../../src/lib/types'
import { ORDER_STATUSES } from '../../src/lib/types'
import { buildWooMetrics, deltaPct, deriveWoo, metric, round2, type WooTotals } from '../../src/lib/derive'
import { eachDay } from '../../src/lib/dateRange'
import { resolveTimeZone, todayIn } from '../../src/lib/timeZone'
import type {
  CouponType,
  CouponUsage,
  CouponsPayload,
  CustomerSegment,
  CustomersPayload,
  ProductsPayload,
} from '../../src/lib/data/types'
import {
  wooCouponPeriod,
  wooCredentials,
  type WooCouponPeriod,
} from '../lib/woo'
import {
  BadRequest,
  asArray,
  isRecord,
  json,
  num,
  readComparison,
  readRange,
  requireEnv,
  toErrorResponse,
} from '../lib/http'

const API_BASE = 'https://app.metorik.com/api/v1/store'
const HINT =
  'WooCommerce metrics could not be loaded. Check the Metorik API key in your Netlify environment, then click Retry.'

/**
 * Orders that took money. Everything else is counted but not banked.
 *
 * `refunded` belongs here even though the money went back. The sale happened,
 * the goods were picked and shipped, and the statement deducts the refund on
 * its own line — so banking it first is what lets that line mean anything.
 * Left out, the order vanished from revenue while its refund was still
 * subtracted, and the two sides of that subtraction described different sets
 * of orders. `cancelled` and `failed` stay out: they never collected.
 */
const PAID_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  'completed',
  'processing',
  'refunded',
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
    const apiKey = requireEnv('METORIK_API_KEY')
    // Resolved before the range is clamped: which day is "today" depends on
    // the store's calendar, and clamping on UTC withheld a day the store had
    // already been trading through for most of its afternoon.
    const meta = await storeMeta(apiKey)
    const timeZone = meta.timeZone
    const range = clampToAvailableData(readRange(url), timeZone)

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
    // The window deltas are measured against. A hand-picked one gets the same
    // clamp the range does — Metorik 422s on a future date. The resources above
    // ignore it: they are lists, and a row has nothing to be compared against.
    // Coupons are the exception, being read as a usage report as much as a list.
    const requested = readComparison(url, range)
    const against = requested && clampToAvailableData(requested, timeZone)

    if (resource === 'coupons') {
      return json(await loadCouponsPage(apiKey, range, url, against))
    }
    if (resource === 'traffic') {
      return json(await loadTraffic(apiKey, range, against))
    }
    if (resource === 'shipping') {
      return json(await loadShippingCharged(apiKey, range, url))
    }
    return json(await loadMetrics(apiKey, range, against, meta))
  } catch (err) {
    return toErrorResponse(err, HINT)
  }
}

/**
 * Nothing past today on the store's own calendar, so a hand-typed URL cannot
 * ask for days that have not happened.
 *
 * Today is included. Metorik answers for the current day on every endpoint this
 * function calls — that was checked against the live store, which had five
 * orders on the day in question — so stopping a day short only hid trading that
 * had already happened.
 */
function clampToAvailableData(range: DateRange, timeZone: string): DateRange {
  const maxDate = todayIn(timeZone)
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

export interface StoreMeta {
  timeZone: string
  /** The currency every order total is converted into. */
  currency: string
}

const DEFAULT_META: StoreMeta = { timeZone: 'UTC', currency: 'USD' }

/**
 * A zone named in this deployment's own environment, which outranks the one
 * Metorik reports.
 *
 * Metorik already reports this store as `America/Los_Angeles` and the two
 * normally agree. The override exists for when they do not — a store whose
 * WooCommerce timezone was never set, or one whose reporting day is deliberately
 * kept somewhere else — and so the calendar can be corrected without waiting on
 * an upstream setting.
 */
const overriddenZone = resolveTimeZone(process.env)

let cachedMeta: Promise<StoreMeta> | null = null

function storeMeta(apiKey: string): Promise<StoreMeta> {
  cachedMeta ??= metorik(apiKey, '', {})
    .then((body) => ({
      timeZone:
        overriddenZone ??
        (typeof body.timezone === 'string' && body.timezone
          ? body.timezone
          : DEFAULT_META.timeZone),
      currency:
        typeof body.currency === 'string' && body.currency
          ? body.currency.toUpperCase()
          : DEFAULT_META.currency,
    }))
    .catch(() => {
      // A failed lookup is never cached — one blip would otherwise pin the
      // whole warm instance to UTC and quietly shift every date by a day. An
      // overridden zone still holds through the failure, since it never
      // depended on the lookup.
      cachedMeta = null
      return { ...DEFAULT_META, timeZone: overriddenZone ?? DEFAULT_META.timeZone }
    })
  return cachedMeta
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
    currency: String(row.currency ?? '').toUpperCase(),
    paid: readPaid(row),
    status: readStatus(row.status),
    items: Math.round(pick(row, ['total_items', 'items_count', 'line_items_count', 'quantity'])),
    total: round2(pick(row, ['total'])),
  }
}

/**
 * What the customer was charged, in the currency they were charged in.
 *
 * Metorik converts `total` to store currency, but it carries the original
 * alongside it as `net_original` — `net` in the order's own money. `net` is
 * `total` less refunds, so the pair gives the exchange rate this order was
 * booked at and the gross charge follows from it. The rate has to be taken from
 * the order rather than from the store's own table: a rate applies from the day
 * it was set, and an order from last month was converted at last month's.
 *
 * Zero where the rate cannot be had — a fully refunded order leaves `net` at
 * zero and nothing to divide — and the column shows the bare currency instead.
 */
function readPaid(row: Record<string, unknown>): number {
  const total = num(row.total)
  const net = num(row.net)
  const original = num(row.net_original)
  if (!Number.isFinite(total) || total === 0) return 0
  // Store currency: the two figures are the same number and no rate is needed.
  if (net === total) return round2(original || total)
  if (net <= 0 || original <= 0) return 0
  return round2(total * (original / net))
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
  const orders = parsed.rows.map((row) => normaliseOrder(row, timeZone))

  return {
    orders,
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

interface MarketTally {
  orders: number
  revenue: number
  shippingCost: number
}

/**
 * What one day earned, accumulated order by order.
 *
 * The revenue-side lines — coupons, shipping, tax — are only reported in
 * aggregate by `/orders/totals`, so a per-day copy of them cannot come from
 * there without a call per day. They are struck from the line items of the
 * order rows instead, which the aggregate is already walking for everything
 * else — see `statementLines`. That makes the breakdown free where asking
 * Metorik for it a day at a time would cost a request per row on screen.
 */
interface DayTally {
  orders: number
  grossSales: number
  discounts: number
  shippingCharged: number
  taxCollected: number
  total: number
}

const emptyDay = (): DayTally => ({
  orders: 0,
  grossSales: 0,
  discounts: 0,
  shippingCharged: 0,
  taxCollected: 0,
  total: 0,
})

/** The statement lines of a single order, struck from its line items. */
interface StatementLines {
  grossSales: number
  discounts: number
  shippingCharged: number
  taxCollected: number
}

/**
 * One order's revenue side, read off the goods it sold.
 *
 * A Metorik order row carries `total` and its costs, but none of the four lines
 * the statement is made of — there is no `subtotal`, `discount_total`,
 * `shipping_total` or `total_tax` on it, only in the aggregate `/orders/totals`
 * reports for the period as a whole. The lines are therefore struck from
 * `line_items`, which does carry them per item: `subtotal` is the goods at list
 * price and `total` the same goods after any discount, so the difference
 * between them is what the discount took.
 *
 * Shipping is what is left of the order once discounted goods and their tax are
 * accounted for, because Woo puts both outside the line items. Anything a store
 * books outside those three — an order-level fee — lands in it too; Metorik
 * reports fees separately and they are zero here, and a shipping figure that
 * absorbs a rare fee is a smaller error than one that leaves the row not adding
 * up to its own total.
 */
function statementLines(row: Record<string, unknown>, orderTotal: number): StatementLines {
  let grossSales = 0
  let discounts = 0
  let taxCollected = 0
  let goods = 0

  for (const item of asArray(row.line_items).filter(isRecord)) {
    const subtotal = num(item.subtotal)
    const total = num(item.total)
    grossSales += subtotal
    discounts += subtotal - total
    taxCollected += num(item.total_tax)
    goods += total
  }

  return {
    grossSales,
    discounts,
    taxCollected,
    // Never negative: a row missing its line items would otherwise report the
    // whole order as shipping.
    shippingCharged: Math.max(0, orderTotal - goods - taxCollected),
  }
}

interface Aggregate extends WooTotals {
  byDay: Map<string, DayTally>
  byStatus: Map<OrderStatus, number>
  bySource: Map<string, number>
  byCountry: Map<string, MarketTally>
  byCurrency: Map<string, MarketTally>
  orderCount: number
}

async function loadMetrics(
  apiKey: string,
  range: DateRange,
  against: DateRange | null,
  meta: StoreMeta,
): Promise<WooMetrics> {
  // The comparison costs two of the five upstream calls, so turning it off
  // makes the whole load meaningfully cheaper rather than merely quieter.
  const [current, previousAgg, newCustomers, prevCustomers, revenueSide, prevRevenueSide] =
    await Promise.all([
      aggregate(apiKey, range, meta.timeZone),
      against ? aggregate(apiKey, against, meta.timeZone) : null,
      countNewCustomers(apiKey, range),
      against ? countNewCustomers(apiKey, against) : 0,
      paidOrderTotals(apiKey, range, meta.timeZone),
      // The statement's own lines — gross sales, coupons, tax — are only in
      // this call, so comparing them needs it for the other window too.
      against ? paidOrderTotals(apiKey, against, meta.timeZone) : null,
    ])

  current.newCustomers = newCustomers
  if (previousAgg) previousAgg.newCustomers = prevCustomers

  const derived = deriveWoo(current)
  const previousDerived = previousAgg ? deriveWoo(previousAgg) : null

  return buildWooMetrics(derived, previousDerived, {
    revenueSeries: toSeries(range, current.byDay),
    // Every day in the range, so the days nothing went back read as zero
    // rather than as a gap the line hops over.
    refundSeries: eachDay(range).map((date) => ({
      date,
      refunds: round2(revenueSide.refundsByDay.get(date) ?? 0),
    })),
    dailyBreakdown: toBreakdown(range, current.byDay, revenueSide.refundsByDay),
    ordersByStatus: toStatusCounts(current.byStatus),
    revenueBySource: toSources(current.bySource),
    revenueByCountry: toMarkets(current.byCountry),
    revenueByCurrency: toMarkets(current.byCurrency),
    storeCurrency: meta.currency,
    pnl: buildPnl(revenueSide, derived),
    pnlPrevious:
      prevRevenueSide && previousDerived
        ? buildPnl(prevRevenueSide, previousDerived)
        : null,
    orderCount: current.orderCount,
  })
}

/** The revenue-side lines Metorik only reports in aggregate. */
interface RevenueSide {
  net: number
  discount: number
  shipping: number
  tax: number
  /** Issued in the period, on each refund's own date — the statement's line. */
  refunds: number
  /** The same money by the day it went out, for the chart. */
  refundsByDay: Map<string, number>
  /**
   * The refunds Metorik has already netted off `net`, which are the ones
   * recorded against orders *created* in the period.
   *
   * A different population from `refunds` above, and needed for a different
   * reason: it is added back so gross sales can state what was billed before
   * anything was handed back. Deducting the other figure lower down is what
   * makes total revenue what the store kept.
   */
  refundsInNet: number
}

/**
 * What went back to customers in the period, on the date each refund was
 * actually issued.
 *
 * Not `total_refunds` on the orders call, which is the money refunded against
 * orders *created* in the range. Those are different questions and they gave
 * very different answers: for one week the orders call reported $10 while the
 * store had handed back $283.08, because five of the six refunds were issued
 * that week against orders placed earlier. A refund belongs to the week the
 * money left, which is also the basis Metorik's own dashboard reports.
 *
 * `amount` is store currency; `amount_original` is what the customer saw.
 */
async function refundsIssued(
  apiKey: string,
  range: DateRange,
  timeZone: string,
): Promise<{ total: number; byDay: Map<string, number> }> {
  const rows = await collectAllRows(apiKey, '/refunds', {
    filters: JSON.stringify([
      { field: 'refund_created_at', operator: 'between', value: [range.start, range.end] },
    ]),
  })

  const byDay = new Map<string, number>()
  let total = 0

  for (const row of rows) {
    // Guarded against a negative: a refund is a magnitude here, and the sign
    // is applied by whatever deducts or plots it.
    const amount = Math.max(0, num(row.amount))
    total += amount
    // Bucketed on the store's clock like every other timestamp — the
    // timestamps arrive in UTC, and a late-evening refund would otherwise be
    // plotted on the following day and fall off the end of the range.
    const day = toStoreTime(String(row.refund_created_at ?? ''), timeZone).slice(0, 10)
    if (day) byDay.set(day, round2((byDay.get(day) ?? 0) + amount))
  }

  return { total: round2(total), byDay }
}

/* ------------------------------------------------------------------ *
 * Shipping charged, by destination
 * ------------------------------------------------------------------ */

/** Countries fetched individually before the tail is lumped into one row. */
const MAX_SHIPPING_COUNTRIES = 25

/** In flight at once. Metorik is asked for one country at a time and 25 at
 *  once is a burst it has no reason to welcome. */
const SHIPPING_CONCURRENCY = 5

/**
 * What each destination was charged for postage.
 *
 * There is no cheaper way to get this. The order rows carry `shipping_cogs` —
 * what the store paid — but nothing for what the customer paid: an order's own
 * `net` already includes its shipping, so `total − net − refunds` is zero on
 * every order and the figure cannot be derived. Only `/orders/totals` splits
 * `total_shipping` out, and only for whatever its filters select, so it is
 * asked once per country.
 *
 * Tax is fetched alongside and kept separate rather than folded in. It is not
 * evenly spread — over July the store's entire $179.83 of tax sat on US orders
 * — so a combined figure would overstate exactly the destination that matters
 * most.
 *
 * The countries come from the caller, which already has the split from the
 * metrics payload. That saves sweeping every order again purely to rediscover
 * a list the page is holding.
 */
async function loadShippingCharged(
  apiKey: string,
  range: DateRange,
  url: URL,
): Promise<ShippingChargedPayload> {
  const asked = (url.searchParams.get('countries') ?? '')
    .split(',')
    .map((code) => code.trim().toUpperCase())
    .filter((code) => /^[A-Z]{2}$/.test(code))

  const countries = [...new Set(asked)].slice(0, MAX_SHIPPING_COUNTRIES)
  const dates = { field: 'order_created_at', operator: 'between', value: [range.start, range.end] }
  const status = { field: 'status', operator: 'in', value: [...PAID_STATUSES] }

  const one = async (country: string) => {
    const body = await metorik(
      apiKey,
      '/orders/totals',
      withFilters([
        dates,
        status,
        { field: 'billing_address_country', operator: 'in', value: [country] },
      ]),
    )
    const data = isRecord(body.data) ? body.data : {}
    return {
      country,
      charged: round2(num(data.total_shipping)),
      tax: round2(num(data.total_tax)),
      orders: Math.round(num(data.count)),
    }
  }

  const rows: ShippingChargedRow[] = []
  for (let i = 0; i < countries.length; i += SHIPPING_CONCURRENCY) {
    rows.push(
      ...(await Promise.all(countries.slice(i, i + SHIPPING_CONCURRENCY).map(one))),
    )
  }

  // The store-wide figure comes from one unfiltered call rather than by adding
  // the rows up, so the caller can state a remainder for the destinations that
  // were not asked about instead of quietly dropping them.
  const allBody = await metorik(apiKey, '/orders/totals', withFilters([dates, status]))
  const all = isRecord(allBody.data) ? allBody.data : {}

  return {
    byCountry: rows,
    storeCharged: round2(num(all.total_shipping)),
    storeTax: round2(num(all.total_tax)),
    truncated: [...new Set(asked)].length > countries.length,
  }
}

/**
 * The revenue lines are scoped to the same statuses the per-order loop banks,
 * so they reconcile exactly with the Total Revenue KPI rather than drifting.
 *
 * Refunds cannot come from that call at all — see {@link refundsIssued} — so
 * they are fetched alongside it rather than read off it.
 */
async function paidOrderTotals(
  apiKey: string,
  range: DateRange,
  timeZone: string,
): Promise<RevenueSide> {
  const dates = { field: 'order_created_at', operator: 'between', value: [range.start, range.end] }
  const [paid, refunds] = await Promise.all([
    metorik(
      apiKey,
      '/orders/totals',
      withFilters([dates, { field: 'status', operator: 'in', value: [...PAID_STATUSES] }]),
    ),
    refundsIssued(apiKey, range, timeZone),
  ])

  const data = isRecord(paid.data) ? paid.data : {}
  return {
    net: num(data.net),
    discount: num(data.total_discount),
    shipping: num(data.total_shipping),
    tax: num(data.total_tax),
    refunds: refunds.total,
    refundsByDay: refunds.byDay,
    refundsInNet: num(data.total_refunds),
  }
}

/**
 * `total = net + shipping + tax + refunds`, verified against the live store:
 * 3903.06 + 341.10 + 39.91 + 10.00 = 4294.07, exactly Metorik's own total.
 *
 * So `net` is the goods alone — no shipping, no tax — after both the discounts
 * and the refunds have come off. Gross sales is what was billed before either,
 * which means adding both back. Do that and the statement's total sales lands
 * on Metorik's `total` to the penny, which is the check that this
 * decomposition is the right one.
 *
 * Metorik's `total_fees` is deliberately absent: Woo fee lines are charges
 * added to the order, so they already sit inside revenue and deducting them
 * would count them twice.
 */
function buildPnl(side: RevenueSide, derived: WooTotals & { grossProfit: number }): ProfitAndLoss {
  return {
    grossSales: round2(side.net + side.discount + side.refundsInNet),
    discounts: round2(side.discount),
    shippingCharged: round2(side.shipping),
    taxCollected: round2(side.tax),
    totalRevenue: derived.totalRevenue,
    refunds: round2(side.refunds),
    productCost: derived.productCost,
    shippingCost: derived.shippingCost,
    transactionCost: derived.transactionCost,
    otherCost: derived.otherCost,
    grossProfit: derived.grossProfit,
  }
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

/** How many codes the usage leaderboard names before the table takes over. */
const TOP_COUPONS = 8

/**
 * The leaderboard built from the store's own orders, when the WooCommerce keys
 * are configured.
 *
 * Preferred over the coupon report wherever it is available, because a coupon
 * report can only describe coupons. This store applies most of its money
 * through a discount plugin that leaves the coupon at 0% and puts the discount
 * on a line of its own, so the report is right to say zero and useless for
 * saying who took what.
 */
function wooLeaderboard(
  current: WooCouponPeriod,
  previous: WooCouponPeriod | null,
): CouponUsage[] {
  const used = [...current.byCode.values()]
    .filter((row) => row.uses > 0)
    .sort((a, b) => b.uses - a.uses || b.discount - a.discount)

  return used.slice(0, TOP_COUPONS).map((row) => {
    const before = previous ? (previous.byCode.get(row.code)?.uses ?? 0) : null
    return {
      code: row.code,
      type: row.type,
      amount: row.amount,
      freeShipping: row.freeShipping,
      used: row.uses,
      discount: round2(row.discount),
      revenue: round2(row.revenue),
      share: current.totalUses > 0 ? row.uses / current.totalUses : 0,
      previousUsed: before,
      usedDeltaPct: before === null ? null : deltaPct(row.uses, before),
    }
  })
}

/** Codes redeemed in the comparison window and not at all in this one. */
function wooLapsed(current: WooCouponPeriod, previous: WooCouponPeriod): number {
  let lapsed = 0
  for (const [code, row] of previous.byCode) {
    if (row.uses > 0 && (current.byCode.get(code)?.uses ?? 0) === 0) lapsed++
  }
  return lapsed
}

/** Redemptions per code, summed in case upstream ever splits a code across rows. */
function usesByCode(rows: Record<string, unknown>[]): Map<string, number> {
  const uses = new Map<string, number>()
  for (const row of rows) {
    const code = String(row.code ?? '')
    if (!code) continue
    uses.set(code, (uses.get(code) ?? 0) + Math.max(0, Math.round(num(row.usage_count))))
  }
  return uses
}

/**
 * The codes actually being redeemed in the period, most-used first.
 *
 * Coupons that went unused are dropped rather than listed at zero: a store
 * accumulates dead codes forever, and a leaderboard of them answers nothing.
 * That same filter is why `lapsedCodes` is counted separately — a code that
 * fell from forty uses to none cannot appear here, and is often exactly what
 * the operator is looking for.
 */
function usageLeaderboard(
  rows: Record<string, unknown>[],
  previousRows: Record<string, unknown>[] | null,
): CouponUsage[] {
  const before = previousRows ? usesByCode(previousRows) : null
  const used = rows
    .map(couponRow)
    .filter((row) => row.used > 0)
    .sort((a, b) => b.used - a.used || b.discount - a.discount)

  const totalUses = used.reduce((sum, row) => sum + row.used, 0)

  return used.slice(0, TOP_COUPONS).map((row) => {
    const previousUsed = before ? (before.get(row.code) ?? 0) : null
    return {
      code: row.code,
      type: row.type,
      amount: row.amount,
      // The coupon report says nothing about shipping, so a code that only
      // waives postage is indistinguishable here from one that does nothing.
      freeShipping: false,
      used: row.used,
      discount: row.discount,
      revenue: row.revenue,
      share: totalUses > 0 ? row.used / totalUses : 0,
      previousUsed,
      usedDeltaPct: previousUsed === null ? null : deltaPct(row.used, previousUsed),
    }
  })
}

/** Codes redeemed in the comparison window that were not redeemed in this one. */
function countLapsed(
  rows: Record<string, unknown>[],
  previousRows: Record<string, unknown>[],
): number {
  const now = usesByCode(rows)
  let lapsed = 0
  for (const [code, uses] of usesByCode(previousRows)) {
    if (uses > 0 && (now.get(code) ?? 0) === 0) lapsed++
  }
  return lapsed
}

async function loadCouponsPage(
  apiKey: string,
  range: DateRange,
  url: URL,
  against: DateRange | null,
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

  // The same sweep over the comparison window, and the only reason this
  // endpoint costs a third upstream call — skipped entirely when the picker
  // has the comparison turned off.
  const [body, allRows, previousRows] = await Promise.all([
    metorik(apiKey, '/coupons', currentParams),
    collectAllRows(apiKey, '/coupons', summaryParams),
    against
      ? collectAllRows(apiKey, '/coupons', {
          ...summaryParams,
          start_date: against.start,
          end_date: against.end,
        })
      : null,
  ])

  // Read from the store itself where the keys allow it. A failure here is not
  // allowed to take the page down: the coupon report still answers, less well,
  // and a dashboard that shows the weaker figure beats one showing an error.
  const creds = wooCredentials()
  let woo: WooCouponPeriod | null = null
  let wooPrevious: WooCouponPeriod | null = null
  if (creds) {
    try {
      ;[woo, wooPrevious] = await Promise.all([
        wooCouponPeriod(creds, range),
        against ? wooCouponPeriod(creds, against) : null,
      ])
    } catch {
      woo = null
      wooPrevious = null
    }
  }

  const parsed = readPage(body)
  const summary = couponSummary(allRows)
  const previous = previousRows ? couponSummary(previousRows) : null

  const change = (now: number, before: number): number | null =>
    previous ? deltaPct(now, before) : null

  const avgDiscount = (s: CouponSummary): number =>
    s.couponsUsed > 0 ? s.discountTotal / s.couponsUsed : 0

  // Where the store answered, its own orders are the authority and the KPI
  // strip moves onto them with the leaderboard. The two must agree: a headline
  // reading $73 above rows summing to $220 is worse than either figure alone.
  if (woo) {
    const wooChange = (now: number, before: number | undefined): number | null =>
      wooPrevious ? deltaPct(now, before ?? 0) : null

    return {
      rows: parsed.rows.map(couponRow),
      total: allRows.length || parsed.total,
      page,
      perPage,
      couponsUsed: metric(woo.totalUses, wooChange(woo.totalUses, wooPrevious?.totalUses)),
      discountTotal: metric(
        round2(woo.totalDiscount),
        wooChange(woo.totalDiscount, wooPrevious?.totalDiscount),
      ),
      couponRevenue: metric(
        round2(woo.totalRevenue),
        wooChange(woo.totalRevenue, wooPrevious?.totalRevenue),
      ),
      avgDiscount: metric(
        woo.totalUses > 0 ? round2(woo.totalDiscount / woo.totalUses) : 0,
        null,
      ),
      topCoupons: wooLeaderboard(woo, wooPrevious),
      lapsedCodes: wooPrevious ? wooLapsed(woo, wooPrevious) : null,
    }
  }

  return {
    rows: parsed.rows.map(couponRow),
    total: allRows.length || parsed.total,
    page,
    perPage,
    couponsUsed: metric(summary.couponsUsed, change(summary.couponsUsed, previous?.couponsUsed ?? 0)),
    discountTotal: metric(
      summary.discountTotal,
      change(summary.discountTotal, previous?.discountTotal ?? 0),
    ),
    couponRevenue: metric(
      summary.couponRevenue,
      change(summary.couponRevenue, previous?.couponRevenue ?? 0),
    ),
    avgDiscount: metric(
      avgDiscount(summary),
      change(avgDiscount(summary), previous ? avgDiscount(previous) : 0),
    ),
    topCoupons: usageLeaderboard(allRows, previousRows),
    lapsedCodes: previousRows ? countLapsed(allRows, previousRows) : null,
  }
}

/* ------------------------------------------------------------------ *
 * Traffic — relayed from the store's analytics provider
 *
 * Metorik does not measure traffic itself; it mirrors whatever GA4 reports,
 * which is why `visitor_data_available` matters. A store with no analytics
 * integration answers 200 with that flag false, and reading its zeros as real
 * would put a 0% conversion rate on screen next to a page of live orders.
 * ------------------------------------------------------------------ */

interface VisitorsReport {
  available: boolean
  provider: string
  providerMetric: string
  definition: string
  visitors: number
  orders: number
  /** Ratio in 0..1; Metorik reports whole percentages here. */
  conversionRate: number
  series: TrafficPoint[]
}

async function visitorsReport(
  apiKey: string,
  range: DateRange,
): Promise<VisitorsReport> {
  // This report reads plain `start_date`/`end_date`, unlike /orders which only
  // honours the filters array.
  const body = await metorik(apiKey, '/reports/visitors-by-date', {
    start_date: range.start,
    end_date: range.end,
    group_by: 'day',
    conversion_basis: 'orders',
  })

  const meta = isRecord(body.meta) ? body.meta : {}
  const totals = isRecord(body.totals) ? body.totals : {}

  return {
    // Absent flag is treated as available so a schema change degrades to
    // showing the numbers rather than hiding a working report.
    available: meta.visitor_data_available !== false,
    provider: String(meta.visitor_data_provider ?? ''),
    providerMetric: String(meta.visitor_data_provider_metric ?? ''),
    definition: String(meta.visitor_definition ?? ''),
    visitors: Math.max(0, Math.round(num(totals.visitors))),
    orders: Math.max(0, Math.round(num(totals.orders))),
    conversionRate: num(totals.conversion_rate) / 100,
    series: asArray(body.data)
      .filter(isRecord)
      .map((row) => ({
        date: String(row.date ?? '').slice(0, 10),
        visitors: Math.max(0, Math.round(num(row.visitors))),
        orders: Math.max(0, Math.round(num(row.orders))),
        conversionRate: num(row.conversion_rate) / 100,
      }))
      .filter((point) => point.date.length === 10),
  }
}

async function loadTraffic(
  apiKey: string,
  range: DateRange,
  against: DateRange | null,
): Promise<TrafficMetrics> {
  const [current, previous] = await Promise.all([
    visitorsReport(apiKey, range),
    against ? visitorsReport(apiKey, against) : null,
  ])

  const change = (now: number, before: number): number | null =>
    previous ? deltaPct(now, before) : null

  return {
    available: current.available,
    provider: current.provider,
    providerMetric: current.providerMetric,
    visitorDefinition: current.definition,
    // The baseline travels with the change. `previous` being absent means the
    // comparison is off, which is not the same as a window that saw nothing.
    visitors: metric(
      current.visitors,
      change(current.visitors, previous?.visitors ?? 0),
      previous ? previous.visitors : null,
    ),
    orders: metric(
      current.orders,
      change(current.orders, previous?.orders ?? 0),
      previous ? previous.orders : null,
    ),
    conversionRate: metric(
      current.conversionRate,
      change(current.conversionRate, previous?.conversionRate ?? 0),
      previous ? previous.conversionRate : null,
    ),
    series: current.series,
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
    totalCustomers: 0,
    productCost: 0,
    shippingCost: 0,
    transactionCost: 0,
    otherCost: 0,
    byDay: new Map(),
    byStatus: new Map(),
    bySource: new Map(),
    byCountry: new Map(),
    byCurrency: new Map(),
    orderCount: 0,
  }

  // Counted here rather than from `/customers`, so "customers this period"
  // is scoped to exactly the orders the revenue figures came from.
  const buyers = new Set<string>()

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

      // The same order read twice: once as a figure on the running total, once
      // as a line on its own day.
      const lines = statementLines(row, order.total)
      const tallyDay = agg.byDay.get(day) ?? emptyDay()
      tallyDay.orders++
      tallyDay.total += order.total
      tallyDay.grossSales += lines.grossSales
      tallyDay.discounts += lines.discounts
      tallyDay.shippingCharged += lines.shippingCharged
      tallyDay.taxCollected += lines.taxCollected
      agg.byDay.set(day, tallyDay)

      const shipping = pick(row, ['shipping_cogs', 'shipping_cost', 'shipping_total'])
      agg.productCost += pick(row, ['product_cogs', 'cost_of_goods', 'cogs', 'cost_total'])
      agg.shippingCost += shipping
      agg.transactionCost += pick(row, ['transaction_cogs', 'transaction_fee', 'transaction_fees', 'fees_total'])
      agg.otherCost += pick(row, ['extra_cogs'])

      buyers.add(buyerKey(row, order))

      const source = readSource(row)
      if (source) agg.bySource.set(source, (agg.bySource.get(source) ?? 0) + order.total)

      // Order totals are already converted to the store's own currency, so the
      // two splits sum back to total revenue whatever the buyer paid in.
      tally(agg.byCountry, order.country || '(unknown)', order.total, shipping)
      tally(
        agg.byCurrency,
        String(row.currency ?? '').toUpperCase() || '(unknown)',
        order.total,
        shipping,
      )
    }

    if (!parsed.hasMore || parsed.rows.length === 0) break
  }

  agg.totalRevenue = round2(agg.totalRevenue)
  agg.productCost = round2(agg.productCost)
  agg.shippingCost = round2(agg.shippingCost)
  agg.transactionCost = round2(agg.transactionCost)
  agg.otherCost = round2(agg.otherCost)
  agg.totalCustomers = buyers.size
  return agg
}

/**
 * What counts as one buyer across several orders.
 *
 * A registered customer id is the only identifier the store itself guarantees;
 * email is the next best, and matches a guest who checked out twice with the
 * same address. Failing both, the order stands alone rather than collapsing
 * every anonymous order in the period into a single phantom customer.
 */
function buyerKey(row: Record<string, unknown>, order: Order): string {
  const id = row.customer_id
  if (typeof id === 'number' && id > 0) return `id:${id}`
  if (typeof id === 'string' && id && id !== '0') return `id:${id}`

  const email = order.email.trim().toLowerCase()
  return email ? `email:${email}` : `order:${order.id}`
}

function tally(
  map: Map<string, MarketTally>,
  key: string,
  revenue: number,
  shippingCost: number,
): void {
  const current = map.get(key) ?? { orders: 0, revenue: 0, shippingCost: 0 }
  current.orders++
  current.revenue += revenue
  current.shippingCost += shippingCost
  map.set(key, current)
}

function toMarkets(map: Map<string, MarketTally>): MarketRevenue[] {
  return [...map.entries()]
    .map(([key, tallied]) => ({
      key,
      orders: tallied.orders,
      revenue: round2(tallied.revenue),
      shippingCost: round2(tallied.shippingCost),
    }))
    .sort((a, b) => b.revenue - a.revenue)
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

function toSeries(range: DateRange, byDay: Map<string, DayTally>): RevenuePoint[] {
  // Every calendar day appears, so gaps render as zero rather than vanishing.
  return eachDay(range).map((date) => ({
    date,
    revenue: round2(byDay.get(date)?.total ?? 0),
  }))
}

/**
 * The statement a day at a time.
 *
 * Every calendar day is emitted, including the ones that sold nothing: a table
 * that simply skipped them would put two dates side by side and invite the
 * reader to draw a line between them.
 *
 * Refunds come from their own map, keyed on the day the money went out rather
 * than the day the order came in. That is why a row can show more refunded than
 * it sold — the order being refunded may have been placed weeks earlier — and
 * it is the honest way round: the cash left on this date.
 */
function toBreakdown(
  range: DateRange,
  byDay: Map<string, DayTally>,
  refundsByDay: Map<string, number>,
): RevenueBreakdownRow[] {
  return eachDay(range).map((date) => {
    const day = byDay.get(date) ?? emptyDay()
    const grossSales = round2(day.grossSales)
    const discounts = round2(day.discounts)
    const shippingCharged = round2(day.shippingCharged)
    const taxCollected = round2(day.taxCollected)

    return {
      date,
      orders: day.orders,
      grossSales,
      discounts,
      shippingCharged,
      taxCollected,
      refunds: round2(refundsByDay.get(date) ?? 0),
      // Struck from the lines rather than taken from the order total, so the
      // row's own columns add up to its total on screen. The two agree to the
      // penny in the ordinary case; where a store books something outside these
      // four, a total that disagreed with the row above it would be the more
      // confusing of the two errors.
      totalSales: round2(grossSales - discounts + shippingCharged + taxCollected),
    }
  })
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
