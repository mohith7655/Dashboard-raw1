/**
 * Resolves hand-entered shipping surcharges against the destinations a period
 * actually shipped to.
 *
 * A per-order charge scales with the parcels that went out — twelve orders to
 * Canada at $2 of customs is $24 — so it costs nothing in a period with no
 * orders there. A flat charge applies whole, whether or not anything shipped,
 * because a monthly courier fee is owed either way.
 */
import type {
  CountryShippingCost,
  MarketRevenue,
  ShippingCostLine,
} from './types'
import { round2 } from './derive'

/** Orders per destination in the period, from the country split. */
const ordersByCountry = (markets: MarketRevenue[]): Map<string, number> =>
  new Map(markets.map((row) => [row.key, row.orders]))

export function shippingCostLines(
  costs: CountryShippingCost[],
  markets: MarketRevenue[],
): ShippingCostLine[] {
  const orders = ordersByCountry(markets)

  return costs.map((cost) => {
    const shipped = orders.get(cost.country) ?? 0
    return {
      ...cost,
      orders: shipped,
      applied: round2(
        cost.basis === 'per-order' ? cost.amount * shipped : cost.amount,
      ),
    }
  })
}

export const totalShippingCost = (lines: ShippingCostLine[]): number =>
  round2(lines.reduce((sum, line) => sum + line.applied, 0))

/** What the surcharges add to each destination, keyed by country. */
export function extraByCountry(lines: ShippingCostLine[]): Map<string, number> {
  const extra = new Map<string, number>()
  for (const line of lines) {
    extra.set(line.country, round2((extra.get(line.country) ?? 0) + line.applied))
  }
  return extra
}

/**
 * The country split with the surcharges folded in.
 *
 * A destination carrying a flat charge but no orders this period still appears,
 * at zero orders — it cost money and leaving it out would hide that.
 */
export function withShippingCosts(
  markets: MarketRevenue[],
  lines: ShippingCostLine[],
): MarketRevenue[] {
  const extra = extraByCountry(lines)
  const merged = markets.map((row) => ({
    ...row,
    shippingCost: round2(row.shippingCost + (extra.get(row.key) ?? 0)),
  }))

  const known = new Set(markets.map((row) => row.key))
  for (const [country, applied] of extra) {
    if (known.has(country) || applied === 0) continue
    merged.push({ key: country, orders: 0, revenue: 0, shippingCost: applied })
  }

  return merged
}

/** Ids are generated client-side; the store only ever replaces the whole list. */
export const newShippingCostId = (): string =>
  `sc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
