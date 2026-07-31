/**
 * Deterministic fixture data for the dashboard.
 *
 * Every value is a pure function of the requested date range, so the layout can
 * be built and reviewed before any upstream API is connected. July 2026 is
 * anchored to the reference figures ($22,375.66 revenue, 415 paid orders, 450
 * orders overall), and June 2026 is anchored so the period-over-period deltas
 * land on the reference percentages. Other months are scaled off July.
 */
import type {
  AdsMetrics,
  DateRange,
  Order,
  OrderStatus,
  RevenuePoint,
  SourceRevenue,
  StatusCount,
  WooMetrics,
} from './types'
import { ORDER_STATUSES } from './types'
import {
  buildAdsMetrics,
  buildWooMetrics,
  deriveAds,
  deriveWoo,
  round2,
  type AdsTotals,
} from './derive'
import { eachDay, previousRange, toIso } from './dateRange'

/* ------------------------------------------------------------------ *
 * Seeded randomness — same input, same output, forever.
 * ------------------------------------------------------------------ */

function hash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Deterministic float in [0, 1) for any seed string. */
function rand(seed: string): number {
  let t = hash(seed) + 0x6d2b79f5
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/* ------------------------------------------------------------------ *
 * Monthly anchors
 * ------------------------------------------------------------------ */

interface MonthTotals {
  revenue: number
  /** Orders that produced revenue (completed + processing). */
  paidOrders: number
  /** Every order placed, including cancelled / failed / refunded. */
  allOrders: number
  newCustomers: number
  productCost: number
  shippingCost: number
  transactionCost: number
}

const JULY_2026: MonthTotals = {
  revenue: 22375.66,
  paidOrders: 415,
  allOrders: 450,
  newCustomers: 215,
  productCost: 1615.95,
  shippingCost: 2913.55,
  transactionCost: 533.17,
}

// Back-solved from July so the rendered deltas match the reference:
// revenue +37.4%, customers +12.0%, orders +28.5%, product +42.1%,
// shipping +37.0%, transaction +34.1%.
const JUNE_2026: MonthTotals = {
  revenue: 16285.05,
  paidOrders: 323,
  allOrders: 351,
  newCustomers: 192,
  productCost: 1137.19,
  shippingCost: 2126.68,
  transactionCost: 397.59,
}

const ANCHORS: Record<string, MonthTotals> = {
  '2026-07': JULY_2026,
  '2026-06': JUNE_2026,
}

const monthKey = (iso: string): string => iso.slice(0, 7)

function scaleTotals(t: MonthTotals, factor: number): MonthTotals {
  return {
    revenue: round2(t.revenue * factor),
    paidOrders: Math.round(t.paidOrders * factor),
    allOrders: Math.round(t.allOrders * factor),
    newCustomers: Math.round(t.newCustomers * factor),
    productCost: round2(t.productCost * factor),
    shippingCost: round2(t.shippingCost * factor),
    transactionCost: round2(t.transactionCost * factor),
  }
}

function monthTotals(key: string): MonthTotals {
  const anchored = ANCHORS[key]
  if (anchored) return anchored
  // Months outside the anchored window drift ±25% off July, deterministically.
  return scaleTotals(JULY_2026, 0.75 + rand(`month:${key}`) * 0.5)
}

function daysInMonthKey(key: string): string[] {
  const [y, m] = key.split('-').map(Number)
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return Array.from({ length: count }, (_, i) =>
    toIso(new Date(Date.UTC(y, m - 1, i + 1))),
  )
}

/**
 * Each day's share of its month, weights summing to exactly 1. The squared
 * term skews the distribution so quiet days and occasional spikes both appear,
 * the way real daily revenue behaves.
 */
function dayShare(iso: string): number {
  const key = monthKey(iso)
  const days = daysInMonthKey(key)
  const weights = days.map((d) => dayWeight(d))
  const total = weights.reduce((a, b) => a + b, 0)
  const index = days.indexOf(iso)
  return weights[index] / total
}

function dayWeight(iso: string): number {
  const r = rand(`day:${iso}`)
  return 0.4 + r * r * 3.2
}

/* ------------------------------------------------------------------ *
 * WooCommerce
 * ------------------------------------------------------------------ */

/**
 * Per-day revenue. The final day of each month absorbs the rounding residual,
 * so the chart's daily points sum to exactly the revenue KPI.
 */
function revenueForDay(iso: string): number {
  const key = monthKey(iso)
  const monthRevenue = monthTotals(key).revenue
  const days = daysInMonthKey(key)
  if (iso !== days[days.length - 1]) {
    return round2(monthRevenue * dayShare(iso))
  }
  const others = days
    .slice(0, -1)
    .reduce((sum, d) => sum + round2(monthRevenue * dayShare(d)), 0)
  return round2(monthRevenue - others)
}

function revenueSeries(range: DateRange): RevenuePoint[] {
  return eachDay(range).map((date) => ({ date, revenue: revenueForDay(date) }))
}

type RangeTotals = MonthTotals

/** Sums a range's days, so partial months and multi-month ranges both work. */
function rangeTotals(range: DateRange): RangeTotals {
  const acc: RangeTotals = {
    revenue: 0,
    paidOrders: 0,
    allOrders: 0,
    newCustomers: 0,
    productCost: 0,
    shippingCost: 0,
    transactionCost: 0,
  }
  for (const day of eachDay(range)) {
    const m = monthTotals(monthKey(day))
    const share = dayShare(day)
    acc.revenue += m.revenue * share
    acc.paidOrders += m.paidOrders * share
    acc.allOrders += m.allOrders * share
    acc.newCustomers += m.newCustomers * share
    acc.productCost += m.productCost * share
    acc.shippingCost += m.shippingCost * share
    acc.transactionCost += m.transactionCost * share
  }
  return {
    revenue: round2(acc.revenue),
    paidOrders: Math.round(acc.paidOrders),
    allOrders: Math.round(acc.allOrders),
    newCustomers: Math.round(acc.newCustomers),
    productCost: round2(acc.productCost),
    shippingCost: round2(acc.shippingCost),
    transactionCost: round2(acc.transactionCost),
  }
}

const SOURCE_MIX: { source: string; share: number }[] = [
  { source: 'google', share: 0.5104 },
  { source: '(direct)', share: 0.193 },
  { source: 'facebook', share: 0.12 },
  { source: 'ig', share: 0.0779 },
  { source: 'fb', share: 0.0493 },
  { source: 'bing.com', share: 0.0274 },
  { source: 'duckduckgo.com', share: 0.0132 },
  { source: 'yandex.com', share: 0.0051 },
  { source: 'reddit.com', share: 0.0037 },
]

function revenueBySource(revenue: number): SourceRevenue[] {
  return SOURCE_MIX.map(({ source, share }) => ({
    source,
    revenue: round2(revenue * share),
  })).sort((a, b) => b.revenue - a.revenue)
}

/** Non-revenue statuses and their share of the orders that did not convert. */
const UNPAID_MIX: { status: OrderStatus; share: number }[] = [
  { status: 'cancelled', share: 0.34 },
  { status: 'failed', share: 0.26 },
  { status: 'refunded', share: 0.23 },
  { status: 'on-hold', share: 0.17 },
]

/** Splits a range's orders into a status → count map that sums exactly. */
function statusCounts(totals: RangeTotals): Record<OrderStatus, number> {
  const completed = Math.round(totals.paidOrders * 0.72)
  const counts: Record<OrderStatus, number> = {
    cancelled: 0,
    completed,
    failed: 0,
    'on-hold': 0,
    processing: totals.paidOrders - completed,
    refunded: 0,
  }
  const unpaid = Math.max(0, totals.allOrders - totals.paidOrders)
  let assigned = 0
  UNPAID_MIX.forEach(({ status, share }, i) => {
    const n =
      i === UNPAID_MIX.length - 1
        ? unpaid - assigned
        : Math.round(unpaid * share)
    counts[status] = n
    assigned += n
  })
  return counts
}

function ordersByStatus(totals: RangeTotals): StatusCount[] {
  const counts = statusCounts(totals)
  return ORDER_STATUSES.map((status) => ({ status, count: counts[status] })).filter(
    (s) => s.count > 0,
  )
}

const FIRST_NAMES = [
  'Amara', 'Bennett', 'Camille', 'Dylan', 'Elena', 'Farid', 'Greta', 'Hugo',
  'Imani', 'Jonas', 'Kiara', 'Lucas', 'Marisol', 'Noor', 'Otto', 'Priya',
  'Quinn', 'Rosa', 'Sven', 'Tomas', 'Ulla', 'Viktor', 'Wren', 'Xiomara',
  'Yusuf', 'Zoe',
]

const LAST_NAMES = [
  'Achterberg', 'Blomqvist', 'Castellano', 'Duarte', 'Eriksen', 'Fontaine',
  'Grimaldi', 'Halvorsen', 'Ibarra', 'Jankowski', 'Kowalczyk', 'Lindqvist',
  'Mendoza', 'Nakamura', 'Okonkwo', 'Petrov', 'Quiroga', 'Rasmussen',
  'Sandoval', 'Thorsen', 'Ueda', 'Vasquez', 'Wexler', 'Yamamoto',
]

function customerName(seed: string): string {
  const first = FIRST_NAMES[Math.floor(rand(`first:${seed}`) * FIRST_NAMES.length)]
  const last = LAST_NAMES[Math.floor(rand(`last:${seed}`) * LAST_NAMES.length)]
  return `${first} ${last}`
}

/**
 * The full order list for a range. Built once per range and then sorted and
 * sliced by the table's server-side pagination.
 */
export function buildOrders(range: DateRange): Order[] {
  const totals = rangeTotals(range)
  const days = eachDay(range)
  const counts = statusCounts(totals)

  // Status pool, shuffled deterministically so each day gets a realistic mix.
  const keyed: { status: OrderStatus; key: number }[] = []
  for (const status of ORDER_STATUSES) {
    for (let i = 0; i < counts[status]; i++) {
      keyed.push({ status, key: rand(`shuffle:${range.start}:${status}:${i}`) })
    }
  }
  keyed.sort((a, b) => a.key - b.key)
  const pool = keyed.map((k) => k.status)

  // Distribute orders across days by the same weights that drive revenue,
  // using a running remainder so the total lands exactly on `allOrders`.
  const perDay: number[] = []
  let placed = 0
  days.forEach((_day, i) => {
    const target = Math.round(
      totals.allOrders * cumulativeShare(days, i + 1) / cumulativeShare(days, days.length),
    )
    perDay.push(Math.max(0, target - placed))
    placed = target
  })

  const orders: Order[] = []
  let seq = 560134 - totals.allOrders + 1
  let poolIndex = 0

  days.forEach((day, dayIndex) => {
    const dayRevenue = revenueForDay(day)
    const dayOrders = perDay[dayIndex]
    const statuses = pool.slice(poolIndex, poolIndex + dayOrders)
    poolIndex += dayOrders

    const paidWeights = statuses.map((s, i) =>
      isPaid(s) ? 0.5 + rand(`amt:${day}:${i}`) * 1.2 : 0,
    )
    const paidWeightSum = paidWeights.reduce((a, b) => a + b, 0)

    const lastPaidIndex = statuses.reduce(
      (last, s, i) => (isPaid(s) ? i : last),
      -1,
    )
    let paidAssigned = 0

    statuses.forEach((status, i) => {
      const hour = Math.floor(rand(`hour:${day}:${i}`) * 24)
      const minute = Math.floor(rand(`min:${day}:${i}`) * 60)
      // Paid orders split the day's revenue exactly — the last one absorbs the
      // rounding residual. Unpaid orders carry a plausible value that never
      // reaches the revenue total.
      let total: number
      if (!isPaid(status)) {
        total = round2(28 + rand(`unpaid:${day}:${i}`) * 120)
      } else if (i === lastPaidIndex) {
        total = round2(dayRevenue - paidAssigned)
      } else {
        total = round2((dayRevenue * paidWeights[i]) / (paidWeightSum || 1))
        paidAssigned = round2(paidAssigned + total)
      }
      orders.push({
        id: `ord_${seq}`,
        number: String(seq),
        date: `${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`,
        customer: customerName(`${day}:${i}`),
        status,
        items: 1 + Math.floor(rand(`items:${day}:${i}`) * 5),
        total,
      })
      seq++
    })
  })

  return orders
}

const isPaid = (s: OrderStatus): boolean => s === 'completed' || s === 'processing'

function cumulativeShare(days: string[], upto: number): number {
  let sum = 0
  for (let i = 0; i < upto; i++) sum += dayShare(days[i])
  return sum
}

export function buildWooFixture(range: DateRange): WooMetrics {
  const totals = rangeTotals(range)
  const prevTotals = rangeTotals(previousRange(range))

  const current = deriveWoo({
    totalRevenue: totals.revenue,
    totalOrders: totals.paidOrders,
    newCustomers: totals.newCustomers,
    productCost: totals.productCost,
    shippingCost: totals.shippingCost,
    transactionCost: totals.transactionCost,
  })
  const previous = deriveWoo({
    totalRevenue: prevTotals.revenue,
    totalOrders: prevTotals.paidOrders,
    newCustomers: prevTotals.newCustomers,
    productCost: prevTotals.productCost,
    shippingCost: prevTotals.shippingCost,
    transactionCost: prevTotals.transactionCost,
  })

  return buildWooMetrics(current, previous, {
    revenueSeries: revenueSeries(range),
    ordersByStatus: ordersByStatus(totals),
    revenueBySource: revenueBySource(totals.revenue),
    orderCount: totals.allOrders,
  })
}

/* ------------------------------------------------------------------ *
 * Ad platforms
 * ------------------------------------------------------------------ */

interface AdsAnchor {
  july: AdsTotals
  june: AdsTotals
}

const META: AdsAnchor = {
  july: {
    spend: 3842.19,
    impressions: 412884,
    clicks: 8214,
    conversions: 187,
    conversionValue: 11027.09,
  },
  june: {
    spend: 3207.17,
    impressions: 361545,
    clicks: 6761,
    conversions: 148,
    conversionValue: 8405.56,
  },
}

const GOOGLE: AdsAnchor = {
  july: {
    spend: 2914.63,
    impressions: 268410,
    clicks: 6102,
    conversions: 154,
    conversionValue: 9938.89,
  },
  june: {
    spend: 2536.29,
    impressions: 245803,
    clicks: 5218,
    conversions: 126,
    conversionValue: 7818.4,
  },
}

function adsForRange(anchor: AdsAnchor, range: DateRange): AdsTotals {
  const acc: AdsTotals = {
    spend: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    conversionValue: 0,
  }
  for (const day of eachDay(range)) {
    const key = monthKey(day)
    const base =
      key === '2026-07'
        ? anchor.july
        : key === '2026-06'
          ? anchor.june
          : scaleAds(anchor.july, 0.75 + rand(`ads:${key}`) * 0.5)
    const share = dayShare(day)
    acc.spend += base.spend * share
    acc.impressions += base.impressions * share
    acc.clicks += base.clicks * share
    acc.conversions += base.conversions * share
    acc.conversionValue += base.conversionValue * share
  }
  return {
    spend: round2(acc.spend),
    impressions: Math.round(acc.impressions),
    clicks: Math.round(acc.clicks),
    conversions: Math.round(acc.conversions),
    conversionValue: round2(acc.conversionValue),
  }
}

function scaleAds(t: AdsTotals, factor: number): AdsTotals {
  return {
    spend: round2(t.spend * factor),
    impressions: Math.round(t.impressions * factor),
    clicks: Math.round(t.clicks * factor),
    conversions: Math.round(t.conversions * factor),
    conversionValue: round2(t.conversionValue * factor),
  }
}

function adsFixture(anchor: AdsAnchor, range: DateRange): AdsMetrics {
  return buildAdsMetrics(
    deriveAds(adsForRange(anchor, range)),
    deriveAds(adsForRange(anchor, previousRange(range))),
  )
}

export const buildMetaFixture = (range: DateRange): AdsMetrics =>
  adsFixture(META, range)

export const buildGoogleAdsFixture = (range: DateRange): AdsMetrics =>
  adsFixture(GOOGLE, range)
