import type { AdsCounters, AdsMetrics, Campaign, Metric, WooMetrics } from './types'

export function metric(
  value: number,
  deltaPct: number | null,
  previous?: number | null,
): Metric {
  return { value, deltaPct, previous }
}

/** Percentage change of `current` against `previous`, or null if incomputable. */
export function deltaPct(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null
  return ((current - previous) / previous) * 100
}

const safeDiv = (a: number, b: number): number => (b === 0 ? 0 : a / b)

export const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * Orders that failed in the period, or null when the metric set has not
 * loaded — which is not the same as none having failed.
 *
 * Read from the status counts rather than from a page of orders: the page
 * holds ten rows and the question is about the whole period. Statuses with no
 * orders are dropped upstream, so an absent entry means zero.
 */
export const failedOrderCount = (woo: WooMetrics | undefined): number | null =>
  woo ? (woo.ordersByStatus.find((s) => s.status === 'failed')?.count ?? 0) : null

/** Totals + ratios that are always derived, never taken from upstream. */
export interface WooTotals {
  totalRevenue: number
  totalOrders: number
  newCustomers: number
  /** Distinct buyers behind `totalOrders`. */
  totalCustomers: number
  productCost: number
  shippingCost: number
  transactionCost: number
  /** Metorik's `extra_cogs`; folded into total cost so nothing is dropped. */
  otherCost: number
}

export interface WooDerived extends WooTotals {
  totalCost: number
  grossProfit: number
  grossMargin: number
  avgOrderValue: number
  returningCustomers: number
}

export function deriveWoo(t: WooTotals): WooDerived {
  const totalCost = round2(
    t.productCost + t.shippingCost + t.transactionCost + t.otherCost,
  )
  const grossProfit = round2(t.totalRevenue - totalCost)
  return {
    ...t,
    totalCost,
    grossProfit,
    grossMargin: safeDiv(grossProfit, t.totalRevenue),
    avgOrderValue: round2(safeDiv(t.totalRevenue, t.totalOrders)),
    // The two counts come from different questions — new is "first ever order
    // in this period" across all statuses, total is "placed a paid order in
    // this period" — so a first order that was later cancelled can make new
    // exceed total. Clamping keeps the card from reading a negative.
    returningCustomers: Math.max(0, t.totalCustomers - t.newCustomers),
  }
}

/**
 * Builds the full metric set from a current and a comparison total.
 *
 * `previous` is null when the comparison is turned off, and every delta then
 * reads as absent rather than as no change — which is the same state a metric
 * with nothing to divide by was always in.
 */
export function buildWooMetrics(
  current: WooDerived,
  previous: WooDerived | null,
  rest: Pick<
    WooMetrics,
    | 'revenueSeries'
    | 'refundSeries'
    | 'dailyBreakdown'
    | 'ordersByStatus'
    | 'revenueBySource'
    | 'revenueByCountry'
    | 'revenueByCurrency'
    | 'storeCurrency'
    | 'pnl'
    | 'pnlPrevious'
    | 'orderCount'
  >,
): WooMetrics {
  const of = <K extends keyof WooDerived>(key: K): Metric =>
    metric(
      current[key],
      previous ? deltaPct(current[key], previous[key]) : null,
      previous ? previous[key] : null,
    )

  return {
    totalRevenue: of('totalRevenue'),
    newCustomers: of('newCustomers'),
    totalCustomers: of('totalCustomers'),
    returningCustomers: of('returningCustomers'),
    avgOrderValue: of('avgOrderValue'),
    totalOrders: of('totalOrders'),
    totalCost: of('totalCost'),
    productCost: of('productCost'),
    shippingCost: of('shippingCost'),
    transactionCost: of('transactionCost'),
    grossProfit: of('grossProfit'),
    // Margin is a ratio of ratios; the reference design shows it without a delta.
    grossMargin: metric(current.grossMargin, null),
    ...rest,
  }
}

/**
 * Raw counters an ad platform reports; everything else is derived from these.
 * Named in `types.ts` because a built `AdsMetrics` carries them too.
 */
export type AdsTotals = AdsCounters

export interface AdsDerived extends AdsTotals {
  ctr: number
  roas: number
  cpc: number
  cpm: number
}

export function deriveAds(t: AdsTotals): AdsDerived {
  return {
    ...t,
    ctr: safeDiv(t.clicks, t.impressions),
    roas: safeDiv(t.conversionValue, t.spend),
    cpc: round2(safeDiv(t.spend, t.clicks)),
    cpm: round2(safeDiv(t.spend, t.impressions) * 1000),
  }
}

/** As above: a null `previous` means the comparison is off, not that it was flat. */
export function buildAdsMetrics(
  current: AdsDerived,
  previous: AdsDerived | null,
  campaigns: Campaign[] = [],
): AdsMetrics {
  const of = <K extends keyof AdsDerived>(key: K): Metric =>
    metric(
      current[key],
      previous ? deltaPct(current[key], previous[key]) : null,
      previous ? previous[key] : null,
    )

  return {
    spend: of('spend'),
    impressions: of('impressions'),
    clicks: of('clicks'),
    ctr: of('ctr'),
    roas: of('roas'),
    cpc: of('cpc'),
    cpm: of('cpm'),
    conversions: of('conversions'),
    campaigns,
    totals: counters(current),
    previousTotals: previous && counters(previous),
  }
}

/** Strips the derived ratios back off, leaving only what is safe to add up. */
const counters = (t: AdsTotals): AdsCounters => ({
  spend: t.spend,
  impressions: t.impressions,
  clicks: t.clicks,
  conversions: t.conversions,
  conversionValue: t.conversionValue,
})

/** Campaign ratios come from the same derivation the account totals use. */
export function buildCampaign(
  identity: { id: string; name: string; status: string },
  totals: AdsTotals,
): Campaign {
  const d = deriveAds(totals)
  return {
    ...identity,
    spend: round2(d.spend),
    impressions: d.impressions,
    clicks: d.clicks,
    ctr: d.ctr,
    conversions: d.conversions,
    conversionValue: round2(d.conversionValue),
    roas: d.roas,
    cpc: d.cpc,
  }
}

/** An empty accumulator, so callers can sum rows onto it. */
export const emptyAdsTotals = (): AdsTotals => ({
  spend: 0,
  impressions: 0,
  clicks: 0,
  conversions: 0,
  conversionValue: 0,
})

/**
 * Drops campaigns that neither spent nor served — a platform will happily
 * return every campaign it has ever had, and rows of zeroes bury the ones that
 * actually ran. Ordered by spend so the table opens on what cost the most.
 */
export function rankCampaigns(campaigns: Campaign[]): Campaign[] {
  return campaigns
    .filter((c) => c.spend > 0 || c.impressions > 0 || c.clicks > 0)
    .sort((a, b) => b.spend - a.spend)
}
