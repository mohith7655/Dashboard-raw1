/**
 * The average a chart draws as a rule, and the range that qualifies it.
 *
 * Apart from the panel that renders it so the arithmetic can be read, reused
 * and tested without a component around it — and so the charts importing the
 * constant do not drag a component module in behind it.
 */

/**
 * An average is drawn in the colour of the series it averages, and told apart
 * from it by the dots alone. It adds no hue of its own anywhere on the page.
 *
 * That rule was arrived at by the palette validator rather than by taste. A
 * recessive neutral works on a single-series chart, but Revenue and Refunds
 * carries two averages on two axes, and every candidate pair of new hues
 * failed: a grey for revenue and a blue for the rate came out at ΔE 8.2
 * against the rate line itself, and re-stepping the blue either dropped below
 * 3:1 on this surface or collided with the grey instead. That chart's five
 * colours are already tuned to a worst pair of 12.9 simulated and 17.1
 * unsimulated; a sixth and seventh had nowhere to go.
 *
 * Taking the series' own colour dissolves the problem rather than solving it.
 * Identity is exact instead of approximate — the rule is the same ink as the
 * line it belongs to — the dots carry the average-versus-series distinction as
 * secondary encoding, and no validated palette gains a member.
 */

/**
 * The rule as a row of dots.
 *
 * A zero-length dash under a round cap renders as a circle, so the gap is the
 * whole pattern and the spacing is read from the second number alone. Kept
 * beside the colour because the plot and the legend swatch both draw it, and a
 * reference the legend describes with a different stroke is a legend that
 * describes a mark not on the chart.
 *
 * Paired with `strokeLinecap="round"` wherever it is used — without the round
 * cap a zero-length dash has nothing to draw and the rule disappears.
 */
export const AVERAGE_DASH = '0.1 7'

export interface Summary {
  average: number
  peak: { value: number; date: string }
  low: { value: number; date: string }
  /** How many points the figures are struck from. */
  days: number
}

/**
 * The three figures, over the points that count.
 *
 * `counts` exists for the rates. A day with no visitors has no conversion rate
 * — not a rate of zero — and folding those days in as zeroes would drag the
 * average toward a figure no day actually recorded. Series where every zero is
 * a real zero, like revenue, simply omit the predicate.
 *
 * Null rather than a zeroed summary when nothing counts: a period with no
 * qualifying day has no average, and a rule drawn at zero would assert one.
 */
export function summarise<T extends { date: string }>(
  data: T[],
  value: (point: T) => number,
  counts: (point: T) => boolean = () => true,
): Summary | null {
  const points = data
    .filter((point) => counts(point) && Number.isFinite(value(point)))
    .map((point) => ({ value: value(point), date: point.date }))

  if (points.length === 0) return null

  let peak = points[0]
  let low = points[0]
  let sum = 0
  for (const point of points) {
    sum += point.value
    if (point.value > peak.value) peak = point
    if (point.value < low.value) low = point
  }

  return { average: sum / points.length, peak, low, days: points.length }
}
