/**
 * Resolves hand-entered operating costs onto whatever range is on screen.
 *
 * Recurring costs are prorated against the calendar rather than a flat average,
 * so a monthly salary reads as exactly one month's pay over a full calendar
 * month — in February as much as in August — and a part-month range gets the
 * matching fraction. An average-length month would show $3,055 for a $3,000
 * salary in a 31-day month, which is the kind of discrepancy that makes people
 * stop trusting the whole statement.
 */
import type { CostLine, DateRange, OperatingCost } from './types'
import { round2 } from './derive'
import { parseIsoDate } from './format'

const DAY_MS = 86_400_000

/** Inclusive day count, so a single-day range counts as one day, not zero. */
export function daysInRange(range: DateRange): number {
  const start = parseIsoDate(range.start).getTime()
  const end = parseIsoDate(range.end).getTime()
  if (end < start) return 0
  return Math.round((end - start) / DAY_MS) + 1
}

const daysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month + 1, 0)).getUTCDate()

const daysInYear = (year: number): number =>
  daysInMonth(year, 1) === 29 ? 366 : 365

/**
 * Sums, across every calendar month the range touches, that month's charge
 * scaled by how much of the month the range actually covers.
 */
function monthlyShare(range: DateRange): number {
  const start = parseIsoDate(range.start)
  const end = parseIsoDate(range.end)
  let share = 0

  let year = start.getUTCFullYear()
  let month = start.getUTCMonth()

  while (year < end.getUTCFullYear() || (year === end.getUTCFullYear() && month <= end.getUTCMonth())) {
    const length = daysInMonth(year, month)
    const monthStart = Date.UTC(year, month, 1)
    const monthEnd = Date.UTC(year, month, length)
    const from = Math.max(monthStart, start.getTime())
    const to = Math.min(monthEnd, end.getTime())

    if (to >= from) share += (Math.round((to - from) / DAY_MS) + 1) / length

    month += 1
    if (month > 11) {
      month = 0
      year += 1
    }
  }

  return share
}

/** The same idea a year at a time, so leap years do not drift. */
function yearlyShare(range: DateRange): number {
  const start = parseIsoDate(range.start)
  const end = parseIsoDate(range.end)
  let share = 0

  for (let year = start.getUTCFullYear(); year <= end.getUTCFullYear(); year++) {
    const yearStart = Date.UTC(year, 0, 1)
    const yearEnd = Date.UTC(year, 11, 31)
    const from = Math.max(yearStart, start.getTime())
    const to = Math.min(yearEnd, end.getTime())

    if (to >= from) share += (Math.round((to - from) / DAY_MS) + 1) / daysInYear(year)
  }

  return share
}

/**
 * The part of `range` a cost was actually live for. A subscription taken out
 * mid-period should charge from the day it started, not for the whole month.
 * Null when the two do not overlap at all.
 */
function activeWindow(cost: OperatingCost, range: DateRange): DateRange | null {
  const start =
    cost.startDate && cost.startDate > range.start ? cost.startDate : range.start
  const end = cost.endDate && cost.endDate < range.end ? cost.endDate : range.end
  if (start > end) return null
  return { start, end, preset: 'custom' }
}

/* --------------------------- Dated recurrence --------------------------- */

/**
 * Whole charges landing inside the range, counted from an anchor date.
 *
 * Unlike proration this is discrete: half a month contains the payday or it
 * does not, and a salary paid on the 1st does not half-charge a range that
 * starts on the 15th.
 */

/** Every seventh day from the anchor, forwards and backwards. */
function weeklyCount(range: DateRange, anchor: string): number {
  const from = parseIsoDate(anchor).getTime()
  const start = parseIsoDate(range.start).getTime()
  const end = parseIsoDate(range.end).getTime()

  // Whole days first: dividing milliseconds by a week before rounding would put
  // an exact boundary on the wrong side of ceil.
  const firstWeek = Math.ceil(Math.round((start - from) / DAY_MS) / 7)
  const lastWeek = Math.floor(Math.round((end - from) / DAY_MS) / 7)
  return Math.max(0, lastWeek - firstWeek + 1)
}

/** The anchor's day of the month, in every month the range touches. */
function monthlyCount(range: DateRange, anchor: string): number {
  const day = parseIsoDate(anchor).getUTCDate()
  const from = parseIsoDate(range.start)
  const to = parseIsoDate(range.end)
  const start = from.getTime()
  const end = to.getTime()

  let count = 0
  let year = from.getUTCFullYear()
  let month = from.getUTCMonth()

  while (
    year < to.getUTCFullYear() ||
    (year === to.getUTCFullYear() && month <= to.getUTCMonth())
  ) {
    // The 31st lands on the 30th, or on the 28th of February, rather than
    // skipping those months entirely.
    const charged = Date.UTC(year, month, Math.min(day, daysInMonth(year, month)))
    if (charged >= start && charged <= end) count += 1

    month += 1
    if (month > 11) {
      month = 0
      year += 1
    }
  }

  return count
}

/** The anchor's month and day, in every year the range touches. */
function yearlyCount(range: DateRange, anchor: string): number {
  const at = parseIsoDate(anchor)
  const month = at.getUTCMonth()
  const day = at.getUTCDate()
  const from = parseIsoDate(range.start)
  const to = parseIsoDate(range.end)

  let count = 0
  for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear(); year++) {
    // A 29 February anchor falls back to the 28th in common years.
    const charged = Date.UTC(year, month, Math.min(day, daysInMonth(year, month)))
    if (charged >= from.getTime() && charged <= to.getTime()) count += 1
  }
  return count
}

/**
 * The day a recurring charge repeats from.
 *
 * The editor asks for the start date once and writes it to both fields, so they
 * normally agree. Falling back to `startDate` covers rows stored when the two
 * were asked for separately: a cost known to have begun on a date charges from
 * that date rather than quietly reverting to an even spread.
 */
const anchorOf = (cost: OperatingCost): string | undefined =>
  cost.date ?? cost.startDate

/** How many times over `cost` applies to `range`. */
function occurrences(cost: OperatingCost, range: DateRange): number {
  const active = activeWindow(cost, range)
  if (!active) return 0

  // A one-off counts in full on its date and not at all outside it.
  if (cost.cadence === 'once') {
    return cost.date && cost.date >= active.start && cost.date <= active.end ? 1 : 0
  }

  // No date at all means the amount is spread evenly across the period.
  const anchor = anchorOf(cost)
  if (!anchor) {
    switch (cost.cadence) {
      case 'weekly':
        return daysInRange(active) / 7
      case 'monthly':
        return monthlyShare(active)
      case 'yearly':
        return yearlyShare(active)
    }
  }

  switch (cost.cadence) {
    case 'weekly':
      return weeklyCount(active, anchor)
    case 'monthly':
      return monthlyCount(active, anchor)
    case 'yearly':
      return yearlyCount(active, anchor)
  }
}

/* ------------------------------ Descriptions ---------------------------- */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** `1` → `1st`, `22` → `22nd`. */
function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

/**
 * How a row's anchor reads in words — `every Monday`, `the 1st`, `6 Apr`. The
 * date input alone shows one calendar day, which is not what a recurring cost
 * means, so the derived phrase sits beside it.
 */
export function chargeLabel(cost: OperatingCost): string {
  if (cost.cadence === 'once') return ''
  const anchor = anchorOf(cost)
  if (!anchor) return 'prorated'

  const at = parseIsoDate(anchor)
  switch (cost.cadence) {
    case 'weekly':
      return `every ${WEEKDAYS[at.getUTCDay()]}`
    case 'monthly': {
      const day = at.getUTCDate()
      // Only 29–31 can miss a month, and only those need the caveat.
      return day > 28 ? `the ${ordinal(day)} or month end` : `the ${ordinal(day)}`
    }
    case 'yearly':
      return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}`
  }
  return ''
}

/** True when the window can never match, so the UI can say so rather than just showing zero. */
export const hasImpossibleWindow = (cost: OperatingCost): boolean =>
  !!cost.startDate && !!cost.endDate && cost.startDate > cost.endDate

/** Resolves each cost against the range, largest first. Zero lines are kept
 *  so a one-off outside the range is visibly zero rather than silently gone. */
export function costLines(costs: OperatingCost[], range: DateRange): CostLine[] {
  return costs
    .map((cost) => ({
      ...cost,
      applied: round2(cost.amount * occurrences(cost, range)),
    }))
    .sort((a, b) => b.applied - a.applied || a.name.localeCompare(b.name))
}

export function totalOperatingCost(lines: CostLine[]): number {
  return round2(lines.reduce((sum, line) => sum + line.applied, 0))
}

/** Groups the applied figures by category, largest first, for the summary row. */
export function costsByCategory(
  lines: CostLine[],
): { category: string; amount: number }[] {
  const totals = new Map<string, number>()
  for (const line of lines) {
    if (line.applied === 0) continue
    totals.set(line.category, (totals.get(line.category) ?? 0) + line.applied)
  }
  return [...totals]
    .map(([category, amount]) => ({ category, amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount)
}

/** Ids only need to be unique within the stored list. */
export function newCostId(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}
