/**
 * Folding the daily statement into weeks or months, and adding it up.
 *
 * Kept out of the component because it is arithmetic rather than presentation:
 * a week's row is the sum of its days, and getting that wrong is a reporting
 * error rather than a layout one.
 */
import type {
  BreakdownGrain,
  LeadDayPoint,
  RevenueBreakdownRow,
  RevenueBreakdownViewRow,
  TrafficPoint,
  UniqueContactPoint,
} from './types'
import { LEAD_SOURCES } from './types'
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

/**
 * Visitors per bucket, folded on the same calendar as the money above.
 *
 * A map rather than a merged row: the traffic series and the statement are
 * separate sources and neither is guaranteed to cover the other's days, so the
 * join has to be able to answer "nothing reported" for a bucket rather than
 * inventing a zero for it.
 */
export function bucketVisitors(
  series: TrafficPoint[],
  grain: BreakdownGrain,
): Map<string, number> {
  const byBucket = new Map<string, number>()
  for (const point of series) {
    const date = bucketStart(point.date, grain)
    byBucket.set(date, (byBucket.get(date) ?? 0) + point.visitors)
  }
  return byBucket
}

/**
 * Leads per bucket, every source added together, on the same calendar.
 *
 * Sources are summed rather than kept apart: the table has one column for
 * them, and which list somebody joined is a question the Lead Data tab
 * answers at length.
 */
export function bucketLeads(
  series: LeadDayPoint[],
  grain: BreakdownGrain,
): Map<string, number> {
  const byBucket = new Map<string, number>()
  for (const point of series) {
    const date = bucketStart(point.date, grain)
    const total = LEAD_SOURCES.reduce((sum, key) => sum + (point[key] ?? 0), 0)
    byBucket.set(date, (byBucket.get(date) ?? 0) + total)
  }
  return byBucket
}

/** Unique Mailchimp/Flodesk email contacts, folded onto the requested grain. */
export function bucketContacts(
  series: UniqueContactPoint[],
): Map<string, number> {
  const byBucket = new Map<string, number>()
  for (const point of series) {
    byBucket.set(point.date, point.contacts)
  }
  return byBucket
}

/**
 * The statement joined to the traffic, with conversion struck per bucket.
 *
 * The rate is computed here, after the folding, and never carried through it.
 * Summing a week's orders and its visitors and dividing once is the week's
 * conversion; averaging seven daily rates is a different number that belongs
 * to no week — and on a day with two visitors and one order it is a wild one.
 *
 * `available` is the provider's own answer to whether it is connected at all.
 * With it false every bucket reports null, which the table prints as a dash:
 * a store with no analytics has an unknown conversion rate, not one of zero.
 */
export function withTraffic(
  rows: RevenueBreakdownRow[],
  visitorsByBucket: Map<string, number>,
  available: boolean,
  leadsByBucket?: Map<string, number>,
  contactsByBucket?: Map<string, number>,
): RevenueBreakdownViewRow[] {
  return rows.map((row) => {
    const visitors = available ? (visitorsByBucket.get(row.date) ?? null) : null
    // Undefined map means the sheet has not been read at all, which is not the
    // same as a bucket it holds no rows for — the first is unknown everywhere,
    // the second is a genuine nought on a day the automation did report.
    const leads = leadsByBucket ? (leadsByBucket.get(row.date) ?? 0) : null
    const contacts = contactsByBucket ? (contactsByBucket.get(row.date) ?? 0) : null

    // Both rates guard the empty denominator as well as the missing one: a day
    // the provider reported zero visitors for divides into an infinite rate,
    // not a hundred percent one.
    const per = (top: number | null) =>
      top === null || visitors === null || visitors === 0 ? null : top / visitors

    return {
      ...row,
      visitors,
      leads,
      contacts,
      conversion: per(row.orders),
      leadRate: per(leads),
    }
  })
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
