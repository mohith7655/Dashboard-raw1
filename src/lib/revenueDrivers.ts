/**
 * Which of the three drivers moved revenue, and by how much.
 *
 * Revenue is traffic × conversion rate × average order value. Each driver's
 * effect is what revenue would have done had only that one moved, and the
 * three add up to the change revenue actually made.
 *
 * The point is diagnostic rather than descriptive. A period can hold revenue
 * flat while losing half its traffic, if conversion and basket size happen to
 * cover the hole — which is what August did here, and what neither the revenue
 * figure nor any of the three rates says on its own.
 */

/**
 * The split is LMDI — each driver weighted by the logarithmic mean of the two
 * revenues, times the log of how far it moved.
 *
 * Chosen over the obvious method, which is to move one driver at a time and
 * hold the others at their old values. That one is order-dependent: substitute
 * traffic first and it takes the blame for the interaction between the three;
 * substitute it last and conversion does. On August's figures the gap between
 * the two orderings runs to thousands, which is the difference between naming
 * traffic the problem and naming it a minor factor.
 *
 * LMDI has no such choice in it. It is exact and symmetric — no driver is
 * privileged by the order they are written in — and the three parts sum to the
 * revenue change with nothing left over whenever the identity holds.
 */
const logMean = (a: number, b: number): number =>
  a === b ? a : (a - b) / Math.log(a / b)

export type DriverKey = 'traffic' | 'conversion' | 'aov'

export const DRIVER_LABELS: Record<DriverKey, string> = {
  traffic: 'Traffic',
  conversion: 'Conversion rate',
  aov: 'Order value',
}

/** One period's three drivers, and what it actually earned. */
export interface DriverInputs {
  visitors: number
  /** Ratio in 0..1. */
  conversionRate: number
  avgOrderValue: number
  revenue: number
}

export interface DriverEffect {
  key: DriverKey
  /** What this driver did to revenue, in currency. */
  effect: number
  /** How far the driver itself moved, as a ratio: 0.3 is up a third. */
  moved: number
}

export interface DriverReport {
  /** The revenue change the effects below account for. */
  change: number
  /** Largest drag first, so the problem leads. */
  effects: DriverEffect[]
  /**
   * The part of the change the three drivers do not explain.
   *
   * Present because this dashboard's average order value divides revenue by
   * every order, while its conversion rate counts only the orders analytics
   * could tie to a visit — and on this store those two order counts differ by
   * six to nine per cent. The product therefore misses revenue by about that
   * much, and the miss is shown rather than absorbed into a driver that did
   * not cause it.
   *
   * Striking the average on the attributed count instead would close it
   * exactly, at the cost of a second average order value disagreeing with the
   * one the store card has always shown. A residual nobody has to reconcile is
   * the cheaper of the two.
   */
  residual: number
  /** The driver dragging hardest, or null where nothing is dragging. */
  laggard: DriverEffect | null
}

/**
 * Null where the split cannot be struck.
 *
 * Every term is a ratio of two figures, so a zero anywhere — no visitors, no
 * orders, a period that earned nothing — leaves a logarithm undefined. Null
 * says the question cannot be answered for this pair of windows, which is
 * different from answering that no driver moved.
 */
export function decomposeRevenue(
  now: DriverInputs,
  before: DriverInputs,
): DriverReport | null {
  const terms: [DriverKey, number, number][] = [
    ['traffic', now.visitors, before.visitors],
    ['conversion', now.conversionRate, before.conversionRate],
    ['aov', now.avgOrderValue, before.avgOrderValue],
  ]
  if (
    !now.revenue ||
    !before.revenue ||
    terms.some(([, a, b]) => !Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0)
  ) {
    return null
  }

  const weight = logMean(now.revenue, before.revenue)
  const effects: DriverEffect[] = terms.map(([key, a, b]) => ({
    key,
    effect: weight * Math.log(a / b),
    moved: a / b - 1,
  }))

  const change = now.revenue - before.revenue
  const residual = change - effects.reduce((sum, e) => sum + e.effect, 0)

  return {
    change,
    // Most negative first: the card leads on what is costing money.
    effects: [...effects].sort((a, b) => a.effect - b.effect),
    residual,
    laggard: effects.some((e) => e.effect < 0)
      ? effects.reduce((worst, e) => (e.effect < worst.effect ? e : worst))
      : null,
  }
}

/**
 * The sentence the card leads with.
 *
 * Says what is dragging even when revenue rose, because that is the case worth
 * catching — revenue up while a driver bleeds is the position that looks safe
 * and is not.
 */
export function driverVerdict(report: DriverReport | null): string | null {
  if (!report) return null
  const { laggard, change } = report
  if (!laggard) {
    return change >= 0
      ? 'All three drivers moved revenue up.'
      : 'Revenue fell, though no single driver drove it down.'
  }

  const label = DRIVER_LABELS[laggard.key].toLowerCase()
  return change >= 0
    ? `Revenue held up despite ${label} — the other drivers covered it.`
    : `${DRIVER_LABELS[laggard.key]} is dragging revenue down.`
}

/* ------------------------- What the goal requires ------------------------ */

/** What one driver has to reach for the goal to be met, all else held. */
export interface RequiredDriver {
  key: DriverKey
  /** Where the driver stands now, over the same window the goal covers. */
  current: number
  /** Where it would have to stand — null where the others leave no solution. */
  required: number | null
  /** `required / current - 1`: the lift needed, as a ratio. Null with no target. */
  lift: number | null
}

/**
 * Each driver on its own, against what the goal needs.
 *
 * Read one line at a time, never all three together. "Visitors must reach
 * 24,000" is true only while conversion and order value hold where they are —
 * as is each of the others — so the three are alternatives, not a plan to
 * carry out at once. Meeting any one of them meets the goal; meeting all three
 * would overshoot it many times over.
 *
 * That framing is the point. A goal is missed for a reason, and the useful
 * question is which of the three is the cheapest to move — not what an
 * unattributed shortfall says about the store in general.
 *
 * Null against a driver at zero: with no visitors there is no conversion rate
 * that reaches any goal, and dividing would answer with an infinity dressed up
 * as a target.
 */
export function requiredDrivers(
  goal: number,
  now: DriverInputs,
): RequiredDriver[] {
  const { visitors, conversionRate, avgOrderValue } = now

  const solve = (a: number, b: number): number | null =>
    a > 0 && b > 0 && Number.isFinite(goal) ? goal / (a * b) : null

  const rows: [DriverKey, number, number | null][] = [
    ['traffic', visitors, solve(conversionRate, avgOrderValue)],
    ['conversion', conversionRate, solve(visitors, avgOrderValue)],
    ['aov', avgOrderValue, solve(visitors, conversionRate)],
  ]

  return rows.map(([key, current, required]) => ({
    key,
    current,
    required,
    lift: required !== null && current > 0 ? required / current - 1 : null,
  }))
}
