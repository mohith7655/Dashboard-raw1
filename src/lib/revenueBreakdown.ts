/**
 * Folding the daily statement into weeks or months, and adding it up.
 *
 * Kept out of the component because it is arithmetic rather than presentation:
 * a week's row is the sum of its days, and getting that wrong is a reporting
 * error rather than a layout one.
 */
import type { BreakdownGrain, RevenueBreakdownRow } from './types'
import { round2 } from './derive'
import { formatDate } from './format'

/** Every money column. Orders is counted separately, being a count. */
const MONEY_KEYS = [
  'grossSales',
  'discounts',
  'shippingCharged',
  'taxCollected',
  'refunds',
  'totalSales',
] as const satisfies readonly (keyof RevenueBreakdownRow)[]

/**
 * The bucket a date belongs to, as the bucket's first day.
 *
 * Weeks start Monday. The dashboard's own presets start their week on Sunday,
 * which is what `rangeFromPreset` uses; a revenue table is read against
 * trading weeks rather than against the picker, and Monday is the one almost
 * every store reports on. The label says which, so neither is ambiguous.
 */
export function bucketStart(date: string, grain: BreakdownGrain): string {
  if (grain === 'day') return date
  const at = new Date(`${date}T00:00:00Z`)

  if (grain === 'month') {
    return `${date.slice(0, 7)}-01`
  }

  // getUTCDay is 0 on Sunday, which is six days into a Monday week rather than
  // the start of one.
  const weekday = (at.getUTCDay() + 6) % 7
  return new Date(at.getTime() - weekday * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Daily rows folded into `grain`, oldest first.
 *
 * Summed rather than re-derived: `totalSales` is added up from the days like
 * every other column, so a week's total is exactly its days' totals and cannot
 * drift from the rows the reader can expand to check.
 */
export function bucketRows(
  rows: RevenueBreakdownRow[],
  grain: BreakdownGrain,
): RevenueBreakdownRow[] {
  if (grain === 'day') return rows

  const byBucket = new Map<string, RevenueBreakdownRow>()

  for (const row of rows) {
    const date = bucketStart(row.date, grain)
    const found = byBucket.get(date)
    if (!found) {
      byBucket.set(date, { ...row, date })
      continue
    }
    found.orders += row.orders
    for (const key of MONEY_KEYS) found[key] += row[key]
  }

  return [...byBucket.values()]
    .map((row) => {
      for (const key of MONEY_KEYS) row[key] = round2(row[key])
      return row
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** The whole table as one row, for the line under it. */
export function totalRow(rows: RevenueBreakdownRow[]): RevenueBreakdownRow {
  const total: RevenueBreakdownRow = {
    date: 'Totals',
    orders: 0,
    grossSales: 0,
    discounts: 0,
    shippingCharged: 0,
    taxCollected: 0,
    refunds: 0,
    totalSales: 0,
  }

  for (const row of rows) {
    total.orders += row.orders
    for (const key of MONEY_KEYS) total[key] += row[key]
  }
  for (const key of MONEY_KEYS) total[key] = round2(total[key])

  return total
}

/** The last day of the calendar week or month `date` opens. */
function bucketEnd(date: string, grain: BreakdownGrain): string {
  const at = new Date(`${date}T00:00:00Z`)
  if (grain === 'week') {
    return new Date(at.getTime() + 6 * 86_400_000).toISOString().slice(0, 10)
  }
  // Day 0 of the next month is the last day of this one, leap years included.
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10)
}

/**
 * What a row's date means, which depends entirely on the grain.
 *
 * A week bucketed to the 3rd covers the 3rd to the 9th, and printing the 3rd
 * alone would read as one day's trading. The span is spelled out instead.
 *
 * Both ends are clamped to the period, because a bucket at either edge is
 * almost always partial: a range opening on a Saturday puts its first week's
 * label back to the Monday before, and `August 2026` on a range covering seven
 * days of it claims three weeks of trading that is not in the figures beside
 * it. A partial bucket is labelled with the days it actually holds.
 */
export function bucketLabel(
  date: string,
  grain: BreakdownGrain,
  firstDate: string,
  lastDate: string,
): string {
  if (grain === 'day') return formatDate(date)

  const start = date < firstDate ? firstDate : date
  const natural = bucketEnd(date, grain)
  const end = natural > lastDate ? lastDate : natural

  if (start === end) return formatDate(start)

  // The month's name only where the row really is the whole month; otherwise
  // the dates, which cannot overstate what they cover.
  if (grain === 'month' && start === date && end === natural) {
    return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    })
  }

  return `${formatDate(start)} – ${formatDate(end)}`
}
