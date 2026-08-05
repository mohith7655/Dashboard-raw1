/**
 * Views that are built entirely from figures the dashboard already loads —
 * no extra upstream calls, so every tab answers its question at a glance.
 */
import type { AdsCounters, AdsMetrics, Campaign, WooMetrics } from './types'
import { buildAdsMetrics, deriveAds, emptyAdsTotals, round2 } from './derive'
import { formatCurrency } from './format'

/* ----------------------------- Profit & loss ---------------------------- */

export type StepKind = 'total' | 'increase' | 'decrease'

export interface WaterfallStep {
  label: string
  /** Signed contribution; totals restate the running figure instead of moving it. */
  amount: number
  kind: StepKind
  /** `[start, end]` on the value axis — Recharts draws this as a floating bar. */
  range: [number, number]
  /** The running figure after this step, for the tooltip. */
  running: number
  /** Pre-formatted direct label, so colour is never the only cue. */
  valueLabel: string
}

/**
 * The full statement: gross sales down through coupons, shipping and tax to
 * total revenue, then every cost down to profit.
 *
 * Zero lines are dropped rather than drawn flat — a store with no refunds
 * should not have to read a refund bar. Ad spend and the net-profit total
 * appear only when a platform actually reported, so a dead connector never
 * reads as "we spent nothing".
 */
export function profitWaterfall(
  woo: WooMetrics,
  adSpend: number | null,
  /** Hand-entered operating costs already prorated onto the range. */
  operatingCost = 0,
): WaterfallStep[] {
  const { pnl } = woo
  const steps: WaterfallStep[] = []
  let running = 0

  const total = (label: string, value: number): void => {
    running = round2(value)
    steps.push({
      label,
      amount: running,
      kind: 'total',
      range: [Math.min(0, running), Math.max(0, running)],
      running,
      valueLabel: formatCurrency(running),
    })
  }

  const move = (label: string, amount: number, kind: 'increase' | 'decrease'): boolean => {
    if (round2(amount) === 0) return false
    const signed = kind === 'decrease' ? -round2(amount) : round2(amount)
    const next = round2(running + signed)
    steps.push({
      label,
      amount: signed,
      kind,
      range: [Math.min(running, next), Math.max(running, next)],
      running: next,
      valueLabel: `${signed < 0 ? '−' : '+'}${formatCurrency(Math.abs(signed))}`,
    })
    running = next
    return true
  }

  total('Gross sales', pnl.grossSales)
  move('Coupons', pnl.discounts, 'decrease')
  move('Shipping charged', pnl.shippingCharged, 'increase')
  move('Tax collected', pnl.taxCollected, 'increase')
  total('Total sales', pnl.totalRevenue)
  move('Product cost', pnl.productCost, 'decrease')
  move('Shipping cost', pnl.shippingCost, 'decrease')
  move('Transaction fees', pnl.transactionCost, 'decrease')
  move('Other costs', pnl.otherCost, 'decrease')
  total('Gross profit', pnl.grossProfit)

  // Refunds, ad spend and payroll-style overheads sit below gross profit
  // rather than inside it: the Gross Profit KPI is revenue less cost of goods,
  // and this bar has to keep agreeing with it.
  let past = move('Refunds', pnl.refunds, 'decrease')
  if (adSpend !== null) past = move('Ad spend', adSpend, 'decrease') || past
  past = move('Operating costs', operatingCost, 'decrease') || past
  if (past) total('Net profit', running)

  return steps
}

/* -------------------------------- Shipping ------------------------------ */

export interface CostSlice {
  label: string
  amount: number
  /** Share of total cost, 0..1. */
  share: number
}

export interface ShippingEconomics {
  cost: number
  perOrder: number
  shareOfRevenue: number
  shareOfCost: number
  /** Where each cost dollar goes, largest first. */
  mix: CostSlice[]
}

const ratio = (a: number, b: number): number => (b === 0 ? 0 : a / b)

export function shippingEconomics(woo: WooMetrics): ShippingEconomics {
  const cost = woo.shippingCost.value
  const totalCost = woo.totalCost.value
  const slices: CostSlice[] = [
    { label: 'Product', amount: woo.productCost.value, share: ratio(woo.productCost.value, totalCost) },
    { label: 'Shipping', amount: cost, share: ratio(cost, totalCost) },
    { label: 'Transaction', amount: woo.transactionCost.value, share: ratio(woo.transactionCost.value, totalCost) },
  ]

  return {
    cost,
    perOrder: round2(ratio(cost, woo.totalOrders.value)),
    shareOfRevenue: ratio(cost, woo.totalRevenue.value),
    shareOfCost: ratio(cost, totalCost),
    mix: slices.sort((a, b) => b.amount - a.amount),
  }
}

/* -------------------------------- Markets ------------------------------- */

export interface MarketSummary {
  countries: number
  currencies: number
  /** Largest country by revenue, or null when nothing sold. */
  topCountry: { key: string; share: number } | null
  /** Revenue share billed in a currency other than the store's own. */
  foreignShare: number
}

export function marketSummary(woo: WooMetrics): MarketSummary {
  const revenue = woo.totalRevenue.value
  const [top] = woo.revenueByCountry
  const foreign = woo.revenueByCurrency
    .filter((row) => row.key !== woo.storeCurrency)
    .reduce((sum, row) => sum + row.revenue, 0)

  return {
    countries: woo.revenueByCountry.length,
    currencies: woo.revenueByCurrency.length,
    topCountry: top ? { key: top.key, share: ratio(top.revenue, revenue) } : null,
    foreignShare: ratio(foreign, revenue),
  }
}

/* -------------------------------- Ad spend ------------------------------ */

export interface PlatformSpend {
  name: string
  spend: number
  roas: number
  conversions: number
}

export interface BlendedAds {
  spend: number
  /** Store revenue per ad dollar — not the platform-attributed figure. */
  blendedRoas: number
  shareOfRevenue: number
  costPerOrder: number
  platforms: PlatformSpend[]
}

/** A campaign with the platform that reported it, for the combined table. */
export interface CampaignRow extends Campaign {
  platform: string
}

export type CampaignSortField =
  | 'spend'
  | 'impressions'
  | 'clicks'
  | 'ctr'
  | 'conversions'
  | 'roas'

/**
 * Every reported platform's campaigns in one list. Ranking across platforms is
 * the point of the view — spend is spend regardless of who booked it — so the
 * rows interleave rather than staying grouped.
 */
export function campaignRows(
  reported: { name: string; metrics: AdsMetrics }[],
  sort: CampaignSortField,
  direction: 'asc' | 'desc',
): CampaignRow[] {
  const rows = reported.flatMap(({ name, metrics }) =>
    metrics.campaigns.map((campaign) => ({ ...campaign, platform: name })),
  )

  const sign = direction === 'asc' ? 1 : -1
  // Ties settle on name so the order never shuffles between renders.
  return rows.sort(
    (a, b) => sign * (a[sort] - b[sort]) || a.name.localeCompare(b.name),
  )
}

const addCounters = (a: AdsCounters, b: AdsCounters): AdsCounters => ({
  spend: a.spend + b.spend,
  impressions: a.impressions + b.impressions,
  clicks: a.clicks + b.clicks,
  conversions: a.conversions + b.conversions,
  conversionValue: a.conversionValue + b.conversionValue,
})

/**
 * Every reported platform as a single account.
 *
 * Built by summing the raw counters and then deriving, which is exactly how one
 * platform's own figures are built — so the combined CTR is total clicks over
 * total impressions, and the combined CPC is total spend over total clicks,
 * rather than an average of two ratios that would weight a tiny account the
 * same as a large one.
 *
 * The comparison window is summed the same way, and only from platforms that
 * reported one; deltas come out of the same builder the per-platform cards use.
 * Returns null when no platform answered, so the block is absent rather than
 * reading as a genuine zero.
 */
export function combinedAds(
  reported: { name: string; metrics: AdsMetrics }[],
): AdsMetrics | null {
  if (reported.length === 0) return null

  const current = reported.reduce(
    (sum, { metrics }) => addCounters(sum, metrics.totals),
    emptyAdsTotals(),
  )

  // A platform with no comparison figures contributes nothing rather than
  // zeroes, which would drag the combined baseline down and invent growth.
  const withPrevious = reported.filter((r) => r.metrics.previousTotals)
  const previous = withPrevious.length
    ? withPrevious.reduce(
        (sum, { metrics }) => addCounters(sum, metrics.previousTotals as AdsCounters),
        emptyAdsTotals(),
      )
    : null

  return buildAdsMetrics(deriveAds(current), previous && deriveAds(previous))
}

/**
 * Blends whichever platforms answered. A platform that failed is left out
 * entirely so its silence never reads as zero spend.
 */
export function blendedAds(
  woo: WooMetrics | undefined,
  reported: { name: string; metrics: AdsMetrics }[],
): BlendedAds | null {
  if (reported.length === 0) return null

  const platforms: PlatformSpend[] = reported.map(({ name, metrics }) => ({
    name,
    spend: metrics.spend.value,
    roas: metrics.roas.value,
    conversions: metrics.conversions.value,
  }))
  const spend = round2(platforms.reduce((sum, p) => sum + p.spend, 0))
  const revenue = woo?.totalRevenue.value ?? 0

  return {
    spend,
    blendedRoas: ratio(revenue, spend),
    shareOfRevenue: ratio(spend, revenue),
    costPerOrder: round2(ratio(spend, woo?.totalOrders.value ?? 0)),
    platforms,
  }
}
