import type { AdsMetrics, Campaign, Metric, WooMetrics } from './types'

export function metric(value: number, deltaPct: number | null): Metric {
  return { value, deltaPct }
}

/** Percentage change of `current` against `previous`, or null if incomputable. */
export function deltaPct(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null
  return ((current - previous) / previous) * 100
}

const safeDiv = (a: number, b: number): number => (b === 0 ? 0 : a / b)

export const round2 = (n: number): number => Math.round(n * 100) / 100

/** Totals + ratios that are always derived, never taken from upstream. */
export interface WooTotals {
  totalRevenue: number
  totalOrders: number
  newCustomers: number
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
  }
}

/** Builds the full metric set from a current and a previous-period total. */
export function buildWooMetrics(
  current: WooDerived,
  previous: WooDerived,
  rest: Pick<
    WooMetrics,
    | 'revenueSeries'
    | 'ordersByStatus'
    | 'revenueBySource'
    | 'revenueByCountry'
    | 'revenueByCurrency'
    | 'storeCurrency'
    | 'pnl'
    | 'orderCount'
  >,
): WooMetrics {
  return {
    totalRevenue: metric(current.totalRevenue, deltaPct(current.totalRevenue, previous.totalRevenue)),
    newCustomers: metric(current.newCustomers, deltaPct(current.newCustomers, previous.newCustomers)),
    avgOrderValue: metric(current.avgOrderValue, deltaPct(current.avgOrderValue, previous.avgOrderValue)),
    totalOrders: metric(current.totalOrders, deltaPct(current.totalOrders, previous.totalOrders)),
    totalCost: metric(current.totalCost, deltaPct(current.totalCost, previous.totalCost)),
    productCost: metric(current.productCost, deltaPct(current.productCost, previous.productCost)),
    shippingCost: metric(current.shippingCost, deltaPct(current.shippingCost, previous.shippingCost)),
    transactionCost: metric(current.transactionCost, deltaPct(current.transactionCost, previous.transactionCost)),
    grossProfit: metric(current.grossProfit, deltaPct(current.grossProfit, previous.grossProfit)),
    // Margin is a ratio of ratios; the reference design shows it without a delta.
    grossMargin: metric(current.grossMargin, null),
    ...rest,
  }
}

/** Raw counters an ad platform reports; everything else is derived from these. */
export interface AdsTotals {
  spend: number
  impressions: number
  clicks: number
  conversions: number
  conversionValue: number
}

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

export function buildAdsMetrics(
  current: AdsDerived,
  previous: AdsDerived,
  campaigns: Campaign[] = [],
): AdsMetrics {
  return {
    spend: metric(current.spend, deltaPct(current.spend, previous.spend)),
    impressions: metric(current.impressions, deltaPct(current.impressions, previous.impressions)),
    clicks: metric(current.clicks, deltaPct(current.clicks, previous.clicks)),
    ctr: metric(current.ctr, deltaPct(current.ctr, previous.ctr)),
    roas: metric(current.roas, deltaPct(current.roas, previous.roas)),
    cpc: metric(current.cpc, deltaPct(current.cpc, previous.cpc)),
    cpm: metric(current.cpm, deltaPct(current.cpm, previous.cpm)),
    conversions: metric(current.conversions, deltaPct(current.conversions, previous.conversions)),
    campaigns,
  }
}

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
