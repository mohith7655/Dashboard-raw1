/**
 * The window a target runs over, chosen by its length rather than typed twice.
 *
 * A target is nearly always a month, a quarter or a year. Asking for both ends
 * of it makes the operator do arithmetic the calendar already knows, and lets
 * them write a "monthly" target that quietly runs for five weeks.
 *
 * So the start is entered and the end follows from the length. `custom` is
 * kept for the window that is genuinely neither — and is what a target set
 * before this existed becomes, so nothing already saved is reinterpreted.
 */
export type TargetPeriod = 'monthly' | 'quarterly' | 'yearly' | 'custom'

export const TARGET_PERIODS: TargetPeriod[] = [
  'monthly',
  'quarterly',
  'yearly',
  'custom',
]

export const TARGET_PERIOD_LABELS: Record<TargetPeriod, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
  custom: 'Custom',
}

/** How many months each length spans. `custom` has no fixed span. */
const MONTHS: Record<Exclude<TargetPeriod, 'custom'>, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
}

/**
 * Parsed as a local calendar day, never through `new Date(string)`.
 *
 * A bare `yyyy-MM-dd` is parsed as UTC midnight, which west of Greenwich is
 * the previous day locally — a target starting on the 1st would render as
 * ending on the 30th. These are calendar days in the store's own reckoning,
 * so they are built from their parts.
 */
function parse(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return null
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) }
}

const format = (y: number, m: number, d: number): string =>
  `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/** Days in a given month, so a shift can be clamped to one that exists. */
const daysIn = (y: number, m: number): number => new Date(y, m, 0).getDate()

/**
 * The same day of the month, `months` later.
 *
 * Clamped to the last day where the target month is shorter: 31 January plus
 * one month is 28 February, not 3 March. Rolling over would push a monthly
 * target into a third month and quietly lengthen its window.
 */
export function addMonths(iso: string, months: number): string {
  const at = parse(iso)
  if (!at) return iso

  const total = at.y * 12 + (at.m - 1) + months
  const y = Math.floor(total / 12)
  const m = (total % 12) + 1
  return format(y, m, Math.min(at.d, daysIn(y, m)))
}

/** The last day of the month `iso` falls in. */
export function endOfMonth(iso: string): string {
  const at = parse(iso)
  if (!at) return iso
  return format(at.y, at.m, daysIn(at.y, at.m))
}

/**
 * Where a window of this length, opened on `start`, closes.
 *
 * Null for `custom`, which is the caller's signal to leave the end alone.
 *
 * A monthly target ends on the last day of the month it opens in, not a month
 * after the day it opens on. A month is the unit the store is actually run and
 * reconciled in — advertising is bought against it, and the figures a target
 * is judged by are closed off at its end — so a target opened on the 12th
 * running to the 12th of the next month straddles two of them and is measured
 * against neither.
 *
 * The degenerate case is left alone deliberately: opened on the last day of a
 * month, a monthly target is one day long. That is visible on the card and
 * corrected by moving the start, where quietly rolling it into the next month
 * would give a target an end its own rule does not produce.
 */
export function endOfPeriod(start: string, period: TargetPeriod): string | null {
  if (period === 'custom') return null
  if (period === 'monthly') return endOfMonth(start)
  return addMonths(start, MONTHS[period])
}

/* ------------------------------ Quarters ------------------------------- */

export type Quarter = 1 | 2 | 3 | 4

export const QUARTERS: Quarter[] = [1, 2, 3, 4]

/** Calendar quarters — Q1 is January to March. */
export function quarterStart(year: number, quarter: Quarter): string {
  return format(year, (quarter - 1) * 3 + 1, 1)
}

/**
 * The quarter a date falls in, so the editor can light the button the current
 * window already matches rather than making the operator work it out.
 */
export function quarterOf(iso: string): { year: number; quarter: Quarter } | null {
  const at = parse(iso)
  if (!at) return null
  return { year: at.y, quarter: (Math.floor((at.m - 1) / 3) + 1) as Quarter }
}

/**
 * Which length a window already matches, for a target saved before the lengths
 * existed.
 *
 * Reported rather than stored, so an old target opens on the button that
 * describes it instead of on `custom`. Anything that matches none of the three
 * is genuinely custom and says so.
 */
export function periodOf(start: string, deadline: string): TargetPeriod {
  for (const period of ['monthly', 'quarterly', 'yearly'] as const) {
    if (endOfPeriod(start, period) === deadline) return period
  }
  return 'custom'
}
