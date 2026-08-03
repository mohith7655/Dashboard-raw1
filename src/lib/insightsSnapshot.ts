/**
 * Builds the payload sent to OpenAI for the Insights tab.
 *
 * Two rules shape it:
 *
 * 1. Aggregates only. Orders, customers and emails never leave the browser —
 *    the snapshot is totals and breakdowns, so no personal data reaches a third
 *    party in exchange for commentary.
 * 2. Absence is explicit. A connector that failed is recorded as unavailable
 *    with its error, rather than being omitted and read as zero. Silence and
 *    "nothing happened" are different findings.
 */
import type {
  AdsMetrics,
  CostLine,
  DateRange,
  Ga4Report,
  Metric,
  SourceError,
  TrafficMetrics,
  WooMetrics,
} from './types'
import { costsByCategory, daysInRange, totalOperatingCost } from './operatingCosts'
import { blendedAds } from './pnl'

/** How many rows of any breakdown to include. Enough to rank, small enough to stay cheap. */
const TOP_N = 8

/** `{ value, deltaPct }` flattened; nulls are dropped so absence stays visible. */
function metric(m: Metric | undefined): { value: number; deltaPct?: number } | null {
  if (!m) return null
  return m.deltaPct === null ? { value: m.value } : { value: m.value, deltaPct: m.deltaPct }
}

interface Source<T> {
  data: T | undefined
  error: SourceError | null
}

/** Either the mapped figures or a stated reason there are none. */
function section<T, R>(source: Source<T>, map: (data: T) => R): R | { unavailable: string } {
  if (source.data) return map(source.data)
  return { unavailable: source.error?.message ?? 'not loaded' }
}

export interface SnapshotInput {
  range: DateRange
  woo: Source<WooMetrics>
  meta: Source<AdsMetrics>
  google: Source<AdsMetrics>
  traffic: Source<TrafficMetrics>
  ga4: Source<Ga4Report>
  costLines: CostLine[]
}

export function buildSnapshot(input: SnapshotInput): Record<string, unknown> {
  const { range, woo, meta, google, traffic, ga4 } = input

  const reported = [
    ...(meta.data ? [{ name: 'Facebook Meta Ads', metrics: meta.data }] : []),
    ...(google.data ? [{ name: 'Google Ads', metrics: google.data }] : []),
  ]
  const blended = blendedAds(woo.data, reported)
  const operating = totalOperatingCost(input.costLines)

  return {
    period: {
      start: range.start,
      end: range.end,
      days: daysInRange(range),
      currency: woo.data?.storeCurrency ?? 'USD',
      note: 'deltaPct compares against the preceding period of equal length. All rates are fractions, not percentages.',
    },

    store: section(woo, (d) => ({
      source: 'WooCommerce via Metorik',
      revenue: metric(d.totalRevenue),
      orders: metric(d.totalOrders),
      avgOrderValue: metric(d.avgOrderValue),
      newCustomers: metric(d.newCustomers),
      grossProfit: metric(d.grossProfit),
      grossMargin: metric(d.grossMargin),
      costs: {
        product: d.productCost.value,
        shipping: d.shippingCost.value,
        transaction: d.transactionCost.value,
        total: d.totalCost.value,
      },
      profitAndLoss: d.pnl,
      revenueByCountry: d.revenueByCountry.slice(0, TOP_N).map((r) => ({
        country: r.key,
        orders: r.orders,
        revenue: r.revenue,
        shippingCost: r.shippingCost,
      })),
      revenueBySource: d.revenueBySource.slice(0, TOP_N),
      ordersByStatus: d.ordersByStatus,
    })),

    advertising: {
      meta: section(meta, adsSummary),
      googleAds: section(google, adsSummary),
      blended: blended
        ? {
            note: 'blendedRoas is store revenue over total ad spend, not the platforms own attribution.',
            spend: blended.spend,
            blendedRoas: blended.blendedRoas,
            shareOfRevenue: blended.shareOfRevenue,
            costPerOrder: blended.costPerOrder,
          }
        : { unavailable: 'no ad platform reported' },
    },

    traffic: section(traffic, (d) =>
      d.available
        ? {
            source: `${d.provider} relayed by Metorik`,
            visitors: metric(d.visitors),
            orders: metric(d.orders),
            conversionRate: metric(d.conversionRate),
            visitorDefinition: d.visitorDefinition,
          }
        : { unavailable: 'no analytics provider connected in Metorik' },
    ),

    analytics: section(ga4, (d) => ({
      source: 'Google Analytics 4 Data API',
      breakdownBy: d.dimension,
      currency: d.currency,
      totals: d.totals,
      rows: d.rows.slice(0, TOP_N),
      note:
        d.unsupported.length > 0
          ? `This property does not report ${d.unsupported.join(', ')}; those read zero.`
          : undefined,
    })),

    operatingCosts: {
      note: 'Hand-entered overheads, prorated onto this range. Not included in grossProfit.',
      total: operating,
      byCategory: costsByCategory(input.costLines),
    },
  }
}

function adsSummary(d: AdsMetrics) {
  return {
    spend: metric(d.spend),
    impressions: metric(d.impressions),
    clicks: metric(d.clicks),
    ctr: metric(d.ctr),
    cpc: metric(d.cpc),
    cpm: metric(d.cpm),
    conversions: metric(d.conversions),
    platformRoas: metric(d.roas),
    campaigns: d.campaigns.slice(0, TOP_N).map((c) => ({
      name: c.name,
      status: c.status,
      spend: c.spend,
      clicks: c.clicks,
      ctr: c.ctr,
      conversions: c.conversions,
      conversionValue: c.conversionValue,
      roas: c.roas,
      cpc: c.cpc,
    })),
  }
}
