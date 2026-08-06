/**
 * Coupon usage read from WooCommerce orders rather than from a coupon report.
 *
 * A coupon report can only describe WooCommerce coupons, and on a store with a
 * discount-rules plugin that is not where the money is. The plugin leaves the
 * real coupon carrying nothing — `newuser20_freeship` is configured at 0% with
 * free shipping — and adds a second line to the order, `new user (20% off)`,
 * with `coupon_id: 0` and the actual discount on it. Both Metorik and
 * WooCommerce's own analytics report the real coupon at zero, correctly, and
 * the money goes unattributed.
 *
 * The order is the only record that holds both lines, so the totals are summed
 * from `coupon_lines` here. Discounts applied with no coupon line at all are
 * kept too: they are why the statement's coupon figure is larger than any
 * per-code total can add up to.
 */
import type { DateRange } from '../../src/lib/types'
import type { CouponType } from '../../src/lib/data/types'
import { isRecord, num } from './http'

/** Orders that took money, matching the statuses the statement banks. */
const PAID_STATUSES = 'completed,processing,refunded'

const PAGE_SIZE = 100
/** Safety valve, as on the Metorik sweep: 4,000 orders is a very long range. */
const MAX_PAGES = 40

/** The label given to money discounted without any coupon line to attribute it to. */
export const AUTOMATIC_DISCOUNT = '(automatic discount)'

export interface WooCouponTally {
  code: string
  type: CouponType
  /** Face value as the order recorded it: `20` for 20%, `0` where none. */
  amount: number
  /** Whether the line grants free shipping — the whole point of a 0% coupon. */
  freeShipping: boolean
  /** Orders this code appeared on. */
  uses: number
  /** What it actually took off, summed across those orders. */
  discount: number
  /** Revenue of the orders it appeared on. */
  revenue: number
}

export interface WooCouponPeriod {
  byCode: Map<string, WooCouponTally>
  totalUses: number
  totalDiscount: number
  totalRevenue: number
}

export interface WooCredentials {
  origin: string
  key: string
  secret: string
}

/**
 * Present only when all three variables are set. A partially configured store
 * reads as unconfigured rather than failing every coupon load — the card falls
 * back to Metorik and the dashboard stays up.
 */
export function wooCredentials(): WooCredentials | null {
  const origin = (process.env.WOO_STORE_URL ?? '').trim().replace(/\/+$/, '')
  const key = (process.env.WOO_CONSUMER_KEY ?? '').trim()
  const secret = (process.env.WOO_CONSUMER_SECRET ?? '').trim()
  if (!origin || !key || !secret) return null
  return { origin, key, secret }
}

async function wooOrders(
  creds: WooCredentials,
  range: DateRange,
  page: number,
): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams({
    // Woo reads these against the site's own timezone, the same basis the
    // store's own reports use.
    after: `${range.start}T00:00:00`,
    before: `${range.end}T23:59:59`,
    status: PAID_STATUSES,
    per_page: String(PAGE_SIZE),
    page: String(page),
    // `meta_data` is where the store currency conversions live, so it has to
    // come back even though it is the bulk of the payload.
    _fields: 'id,currency,total,discount_total,coupon_lines,meta_data',
  })

  const auth = Buffer.from(`${creds.key}:${creds.secret}`).toString('base64')
  const res = await fetch(`${creds.origin}/wp-json/wc/v3/orders?${params.toString()}`, {
    headers: { authorization: `Basic ${auth}`, accept: 'application/json' },
  })

  if (!res.ok) {
    throw new Error(`WooCommerce API error (${res.status}) reading orders`)
  }
  const body: unknown = await res.json().catch(() => null)
  return Array.isArray(body) ? body.filter(isRecord) : []
}

/**
 * A figure from a `meta_data` array, or null when the key is absent.
 *
 * Every money field here has to be converted before it is added to anything.
 * This store takes orders in seven currencies, and summing the raw amounts
 * across them produced a discount total nearly three times the real one — an
 * ILS order reading 280 is 70 in store currency. The multi-currency plugin
 * records the converted figure alongside the raw one, and that is the number
 * Metorik reports, so it is the number the card has to agree with.
 */
function metaNumber(source: Record<string, unknown>, key: string): number | null {
  const meta = Array.isArray(source.meta_data) ? source.meta_data.filter(isRecord) : []
  const found = meta.find((entry) => entry.key === key)
  if (!found || found.value === undefined || found.value === null || found.value === '') {
    return null
  }
  const value = num(found.value)
  return Number.isFinite(value) ? value : null
}

/** Store currency where the conversion is recorded, the raw figure otherwise. */
const inStoreCurrency = (
  source: Record<string, unknown>,
  key: string,
  raw: unknown,
): number => metaNumber(source, key) ?? num(raw)

/**
 * Whether a coupon line is a real WooCommerce coupon rather than one the
 * discount plugin invented.
 *
 * The plugin records `coupon_info` on every line it touches, and its own lines
 * carry an id of 0: `[0,"new user (20% off)","percent",20]` against the real
 * coupon's `[542182,"newuser20_freeship","percent",0,true]`. A line with no
 * such marker is treated as real, so a store without the plugin behaves as it
 * always did.
 */
function isRealCoupon(line: Record<string, unknown>): boolean {
  const meta = Array.isArray(line.meta_data) ? line.meta_data.filter(isRecord) : []
  const info = meta.find((entry) => entry.key === 'coupon_info')
  if (!info || typeof info.value !== 'string') return true
  try {
    const parsed: unknown = JSON.parse(info.value)
    return !Array.isArray(parsed) || num(parsed[0]) > 0
  } catch {
    return true
  }
}

function readType(raw: unknown): CouponType {
  const value = String(raw ?? '')
  return value === 'percent' || value === 'fixed_cart' || value === 'fixed_product'
    ? value
    : 'fixed_cart'
}

/** Folds one order's coupon lines into the running tally. */
function tallyOrder(order: Record<string, unknown>, period: WooCouponPeriod): void {
  const orderTotal = inStoreCurrency(order, '_order_total_base_currency', order.total)
  const lines = Array.isArray(order.coupon_lines) ? order.coupon_lines.filter(isRecord) : []

  if (lines.length === 0) {
    // A discount with nothing to attribute it to — an automatic rule rather
    // than a redeemed code. Counted so the card's total can reconcile with the
    // statement instead of quietly falling short of it.
    const discount = inStoreCurrency(order, '_cart_discount_base_currency', order.discount_total)
    if (discount > 0) {
      add(period, AUTOMATIC_DISCOUNT, {
        type: 'fixed_cart',
        amount: 0,
        freeShipping: false,
        discount,
        revenue: orderTotal,
      })
    }
    return
  }

  const lineDiscount = (line: Record<string, unknown>): number =>
    inStoreCurrency(line, 'discount_amount_base_currency', line.discount)

  // The plugin's lines are the same promotion as the coupon the customer
  // typed, split in two by how the plugin works. Listed separately they put
  // the money under a name nobody entered — `new user (20% off)` — and left
  // the code they did enter reading nothing. The money is credited to the
  // real coupon on the order instead.
  const real = lines.filter(isRealCoupon)
  const invented = lines.filter((line) => !isRealCoupon(line))
  const inventedDiscount = invented.reduce((sum, line) => sum + lineDiscount(line), 0)

  // Nothing real to credit it to — an automatic rule that named itself. It
  // keeps its own name rather than being discarded.
  const credited = real.length > 0 ? real : invented
  const spread = real.length > 0 ? inventedDiscount / real.length : 0

  for (const line of credited) {
    const code = String(line.code ?? '').trim()
    if (!code) continue
    // A free-shipping coupon carries no percentage of its own, so the face
    // value comes off the plugin's line where there is one — the promotion is
    // 20% off however the store chose to record it.
    const invented0 = invented[0]
    const ownAmount = num(line.nominal_amount)
    const borrowed = real.length > 0 && ownAmount <= 0 && invented0 ? invented0 : line

    add(period, code, {
      type: readType(borrowed.discount_type),
      amount: num(borrowed.nominal_amount),
      freeShipping: line.free_shipping === true,
      discount: lineDiscount(line) + spread,
      // Attributed whole to each code on the order. Two codes on one order
      // each get credit for the sale they both contributed to, which is why
      // revenue here is not summed across rows into a store total.
      revenue: orderTotal,
    })
  }
}

function add(
  period: WooCouponPeriod,
  code: string,
  entry: Omit<WooCouponTally, 'code' | 'uses'> & { discount: number; revenue: number },
): void {
  const current = period.byCode.get(code) ?? {
    code,
    type: entry.type,
    amount: entry.amount,
    freeShipping: entry.freeShipping,
    uses: 0,
    discount: 0,
    revenue: 0,
  }
  current.uses += 1
  current.discount += entry.discount
  current.revenue += entry.revenue
  // A face value only ever appears on the line that carries one, so the first
  // non-zero seen wins rather than the last line overwriting it with a zero.
  if (current.amount <= 0 && entry.amount > 0) {
    current.amount = entry.amount
    current.type = entry.type
  }
  current.freeShipping = current.freeShipping || entry.freeShipping
  period.byCode.set(code, current)

  period.totalUses += 1
  period.totalDiscount += entry.discount
}

/** Every paid order in the range, folded into per-code totals. */
export async function wooCouponPeriod(
  creds: WooCredentials,
  range: DateRange,
): Promise<WooCouponPeriod> {
  const period: WooCouponPeriod = {
    byCode: new Map(),
    totalUses: 0,
    totalDiscount: 0,
    totalRevenue: 0,
  }

  for (let page = 1; page <= MAX_PAGES; page++) {
    const orders = await wooOrders(creds, range, page)
    for (const order of orders) {
      if (Array.isArray(order.coupon_lines) && order.coupon_lines.length > 0) {
        period.totalRevenue += inStoreCurrency(order, '_order_total_base_currency', order.total)
      }
      tallyOrder(order, period)
    }
    if (orders.length < PAGE_SIZE) break
  }

  return period
}

/**
 * What each of these orders was actually charged, in its own currency.
 *
 * Metorik converts every total to store currency before it arrives and does
 * not carry the original, so the only way to show what the customer paid is to
 * ask the store. Scoped to the ids on the page — one extra call for ten orders,
 * not a sweep.
 */
export async function wooOrderAmounts(
  creds: WooCredentials,
  ids: string[],
): Promise<Map<string, number>> {
  const numeric = ids.filter((id) => /^\d+$/.test(id))
  if (numeric.length === 0) return new Map()

  const params = new URLSearchParams({
    include: numeric.join(','),
    per_page: String(Math.min(100, numeric.length)),
    _fields: 'id,total',
    // `include` filters, it does not widen: without this the default status
    // set would drop the failed and cancelled orders the table still lists.
    status: 'any',
  })

  const auth = Buffer.from(`${creds.key}:${creds.secret}`).toString('base64')
  const res = await fetch(`${creds.origin}/wp-json/wc/v3/orders?${params.toString()}`, {
    headers: { authorization: `Basic ${auth}`, accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`WooCommerce API error (${res.status}) reading order totals`)

  const body: unknown = await res.json().catch(() => null)
  const rows = Array.isArray(body) ? body.filter(isRecord) : []
  return new Map(rows.map((row) => [String(row.id ?? ''), num(row.total)]))
}
