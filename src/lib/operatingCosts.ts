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

/** How many times over `cost` applies to `range`. */
function occurrences(cost: OperatingCost, range: DateRange): number {
  switch (cost.cadence) {
    case 'weekly':
      return daysInRange(range) / 7
    case 'monthly':
      return monthlyShare(range)
    case 'yearly':
      return yearlyShare(range)
    case 'once':
      // A one-off counts in full on its date and not at all outside it.
      return cost.date && cost.date >= range.start && cost.date <= range.end ? 1 : 0
  }
}

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
