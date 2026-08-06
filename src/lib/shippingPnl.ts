/**
 * Shipping as a business of its own: what customers paid for postage set
 * against what the postage cost.
 *
 * Kept apart from the store's own profit and loss because it answers a
 * different question. The statement asks what the period earned; this asks
 * whether the shipping rates are covering the couriers, which is a decision
 * about the rate card rather than about trading.
 */
import type {
  CountryShippingCost,
  MarketRevenue,
  ShippingChargedPayload,
} from './types'
import { round2 } from './derive'
import { shippingCostLines, extraByCountry } from './shippingCosts'

export interface ShippingResult {
  /** Postage the customers paid. */
  charged: number
  /** What the couriers took, plus any hand-entered surcharge. */
  paid: number
  /** Charged less paid: positive is subsidised by the customer. */
  net: number
  /**
   * Net over charged, in 0..1 — how much of the postage collected survived.
   * Null where nothing was charged, which is not a margin of zero: a store
   * shipping free is not breaking even, it is paying the whole bill.
   */
  margin: number | null
  /** The share of the postage bill the customer covered, 0..1 and uncapped. */
  recovery: number | null
}

function result(charged: number, paid: number): ShippingResult {
  const net = round2(charged - paid)
  return {
    charged: round2(charged),
    paid: round2(paid),
    net,
    margin: charged > 0 ? net / charged : null,
    recovery: paid > 0 ? charged / paid : null,
  }
}

/** One destination's shipping, both sides of it. */
export interface CountryShipping extends ShippingResult {
  country: string
  orders: number
  /** Postage per parcel, on each side. */
  chargedPerOrder: number
  paidPerOrder: number
}

/**
 * The store-wide figure.
 *
 * `charged` comes from the statement's own shipping line, so the two cannot
 * disagree. `paid` adds the hand-entered surcharges to what the orders carry,
 * because a courier fee entered by hand is money out exactly as the order's
 * own shipping cost is.
 */
export function storeShipping(
  shippingCharged: number,
  shippingCost: number,
  extraCost: number,
): ShippingResult {
  return result(shippingCharged, shippingCost + extraCost)
}

/**
 * Per destination, charged against paid.
 *
 * The two sides arrive separately and neither is complete on its own: what was
 * paid comes from the order sweep, what was charged from a call per country.
 * A destination in one and not the other still gets a row — a country that
 * charged nothing and cost $40 is precisely the row worth seeing.
 */
export function countryShipping(
  markets: MarketRevenue[],
  charged: ShippingChargedPayload | undefined,
  extras: CountryShippingCost[],
): CountryShipping[] {
  const lines = shippingCostLines(extras, markets)
  const surcharge = extraByCountry(lines)

  const chargedBy = new Map(
    (charged?.byCountry ?? []).map((row) => [row.country, row]),
  )

  const codes = new Set<string>([
    ...markets.map((row) => row.key),
    ...chargedBy.keys(),
    ...surcharge.keys(),
  ])

  const rows: CountryShipping[] = []
  for (const code of codes) {
    const market = markets.find((row) => row.key === code)
    const paid = round2((market?.shippingCost ?? 0) + (surcharge.get(code) ?? 0))
    const took = chargedBy.get(code)?.charged ?? 0
    const orders = market?.orders ?? chargedBy.get(code)?.orders ?? 0

    if (paid === 0 && took === 0 && orders === 0) continue

    rows.push({
      country: code,
      orders,
      chargedPerOrder: orders > 0 ? round2(took / orders) : 0,
      paidPerOrder: orders > 0 ? round2(paid / orders) : 0,
      ...result(took, paid),
    })
  }

  // Worst first: the destinations losing money are the reason to open this
  // table, and sorting by size would bury a small country that loses on every
  // parcel beneath a large one that breaks even.
  return rows.sort((a, b) => a.net - b.net)
}

/**
 * What the rows do not account for, when more destinations existed than could
 * be asked about individually. Zero when they all were.
 */
export function unlistedCharged(
  charged: ShippingChargedPayload | undefined,
  rows: CountryShipping[],
): number {
  if (!charged) return 0
  const listed = rows.reduce((sum, row) => sum + row.charged, 0)
  return round2(Math.max(0, charged.storeCharged - listed))
}
