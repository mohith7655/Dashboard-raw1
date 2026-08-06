/**
 * Where the visitors came from set against where the money came from.
 *
 * Traffic and markets were two tabs answering half a question each: one knew
 * how many people arrived, the other knew who bought, and neither could say
 * which countries do both. They only join on country, and the two halves spell
 * countries differently — orders carry ISO codes, GA4 reports display names —
 * so the join runs through `countryCode` rather than on the raw key.
 */
import type { Ga4Report, WooMetrics } from './types'
import { countryCode, countryName } from './countries'

export interface CountryRow {
  /** ISO alpha-2, or empty where GA4 named somewhere that did not resolve. */
  code: string
  /** What to print: the country's name, or GA4's own label when unresolved. */
  name: string
  /**
   * GA4 users for this country, or null where analytics reported nothing for
   * it — which is not the same as nobody visiting, and must not read as zero.
   */
  visitors: number | null
  orders: number
  /** Store currency, as every figure on this dashboard is. */
  revenue: number
  shippingCost: number
  /** Orders per visitor. Null without a visitor count to divide by. */
  conversion: number | null
  revenuePerVisitor: number | null
  /** This country's share of the period's revenue. */
  share: number
}

export interface MarketTrafficSummary {
  /** Countries that produced an order. */
  selling: number
  currencies: number
  topCountry: { key: string; share: number } | null
  /** Revenue billed in something other than store currency, as a ratio. */
  foreignShare: number
  foreignRevenue: number
  /** Countries GA4 saw any visitor from, or null when GA4 has not answered. */
  visited: number | null
  /** Those that sent visitors and no orders, largest first. */
  browsingOnly: CountryRow[]
  browsingVisitors: number
}

/** GA4 users per ISO code, plus whatever it named that did not resolve. */
function visitorsByCountry(ga4: Ga4Report | undefined): Map<string, number> {
  const found = new Map<string, number>()
  if (!ga4 || ga4.dimension !== 'country') return found

  for (const row of ga4.rows) {
    const code = countryCode(row.key)
    // Unresolved names keep their own label as the key, prefixed so they can
    // never collide with a real code. `(not set)` lands here, and stays
    // visible rather than being folded silently into a country.
    const key = code || `~${row.key}`
    found.set(key, (found.get(key) ?? 0) + row.users)
  }
  return found
}

/**
 * One row per country either half knows about — an outer join, not an inner
 * one. A country that sent traffic and no orders is the most useful row on the
 * table, and an inner join is exactly what would drop it.
 */
export function countryRows(
  woo: WooMetrics | undefined,
  ga4: Ga4Report | undefined,
): CountryRow[] {
  const visitors = visitorsByCountry(ga4)
  const sales = woo?.revenueByCountry ?? []
  const totalRevenue = sales.reduce((sum, row) => sum + row.revenue, 0)

  const rows: CountryRow[] = []
  const claimed = new Set<string>()

  for (const sale of sales) {
    const code = sale.key === '(unknown)' ? '' : sale.key
    const seen = visitors.get(sale.key) ?? null
    if (seen !== null) claimed.add(sale.key)

    rows.push({
      code,
      name: sale.key === '(unknown)' ? 'Unknown' : countryName(sale.key),
      visitors: seen,
      orders: sale.orders,
      revenue: sale.revenue,
      shippingCost: sale.shippingCost,
      conversion: seen && seen > 0 ? sale.orders / seen : null,
      revenuePerVisitor: seen && seen > 0 ? sale.revenue / seen : null,
      share: totalRevenue === 0 ? 0 : sale.revenue / totalRevenue,
    })
  }

  for (const [key, users] of visitors) {
    if (claimed.has(key)) continue
    const unresolved = key.startsWith('~')
    rows.push({
      code: unresolved ? '' : key,
      name: unresolved ? key.slice(1) : countryName(key),
      visitors: users,
      orders: 0,
      revenue: 0,
      shippingCost: 0,
      conversion: users > 0 ? 0 : null,
      revenuePerVisitor: users > 0 ? 0 : null,
      share: 0,
    })
  }

  // Revenue first, because that is what the page is ranked on; visitors break
  // the tie so the browsing-only countries sort among themselves usefully
  // rather than in whatever order GA4 happened to return them.
  return rows.sort(
    (a, b) => b.revenue - a.revenue || (b.visitors ?? 0) - (a.visitors ?? 0),
  )
}

export function marketTrafficSummary(
  woo: WooMetrics | undefined,
  rows: CountryRow[],
  ga4: Ga4Report | undefined,
): MarketTrafficSummary {
  const revenue = woo?.totalRevenue.value ?? 0
  const top = woo?.revenueByCountry[0]
  const foreign = (woo?.revenueByCurrency ?? [])
    .filter((row) => row.key !== woo?.storeCurrency)
    .reduce((sum, row) => sum + row.revenue, 0)

  const browsingOnly = rows
    .filter((row) => row.orders === 0 && (row.visitors ?? 0) > 0)
    .sort((a, b) => (b.visitors ?? 0) - (a.visitors ?? 0))

  const measured = ga4?.dimension === 'country' ? ga4 : undefined

  return {
    selling: woo?.revenueByCountry.length ?? 0,
    currencies: woo?.revenueByCurrency.length ?? 0,
    topCountry: top
      ? { key: top.key, share: revenue === 0 ? 0 : top.revenue / revenue }
      : null,
    foreignShare: revenue === 0 ? 0 : foreign / revenue,
    foreignRevenue: foreign,
    visited: measured ? measured.rows.length : null,
    browsingOnly,
    browsingVisitors: browsingOnly.reduce((sum, row) => sum + (row.visitors ?? 0), 0),
  }
}
