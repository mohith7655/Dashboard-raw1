import type { Comparison, CompareMode, DateRange, PresetId } from './types'
import { formatDate } from './format'
import { storeTimeZone, todayIn } from './timeZone'

export const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'thisWeek', label: 'This Week' },
  { id: 'lastWeek', label: 'Last Week' },
  { id: 'thisMonth', label: 'This Month' },
  { id: 'lastMonth', label: 'Last Month' },
  { id: 'yearToDate', label: 'Year To Date' },
  { id: 'allTime', label: 'All Time' },
  { id: 'custom', label: 'Custom Range' },
]

/** `yyyy-MM-dd` in UTC. */
export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000)
}

/**
 * The last day the picker will offer: today, on the store's own calendar.
 *
 * Today rather than yesterday. The picker used to stop a day short on the
 * grounds that an in-progress day would 422; it does not — every endpoint this
 * dashboard calls answers for the current day, and the store had five orders on
 * it when that was checked. Stopping short meant the day's trading could not be
 * looked at until it was over.
 *
 * Never past today, though: a range running into days that have not happened is
 * counted in full by everything derived on this side of the boundary, and
 * prorated operating costs are the clearest case — it charges a whole month
 * against however many days have actually traded.
 */
export function latestAvailableDate(): string {
  return todayIn(storeTimeZone())
}

export function rangeFromPreset(preset: PresetId, current?: DateRange): DateRange {
  const today = new Date(`${latestAvailableDate()}T00:00:00Z`)
  switch (preset) {
    case 'today':
      return { start: toIso(today), end: toIso(today), preset }
    case 'yesterday': {
      const yesterday = addDays(today, -1)
      return { start: toIso(yesterday), end: toIso(yesterday), preset }
    }
    case 'thisWeek': {
      const first = addDays(today, -today.getUTCDay())
      return { start: toIso(first), end: toIso(today), preset }
    }
    case 'lastWeek': {
      const thisWeek = addDays(today, -today.getUTCDay())
      const first = addDays(thisWeek, -7)
      return { start: toIso(first), end: toIso(addDays(first, 6)), preset }
    }
    case 'last7':
      return { start: toIso(addDays(today, -6)), end: toIso(today), preset }
    case 'last30':
      return { start: toIso(addDays(today, -29)), end: toIso(today), preset }
    case 'thisMonth': {
      // Ends today, not at the end of the month, the same way `thisWeek` and
      // `yearToDate` do. Running to a date that has not happened yet charged a
      // whole month of recurring operating costs against however many days of
      // trading had actually occurred, and set a five-day period against a
      // full previous month — which is what put −86% beside every figure on
      // the first of the month.
      const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
      return { start: toIso(first), end: toIso(today), preset }
    }
    case 'lastMonth': {
      const first = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1),
      )
      const last = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0))
      return { start: toIso(first), end: toIso(last), preset }
    }
    case 'yearToDate': {
      const first = new Date(Date.UTC(today.getUTCFullYear(), 0, 1))
      return { start: toIso(first), end: toIso(today), preset }
    }
    case 'allTime': {
      const first = new Date(Date.UTC(today.getUTCFullYear() - 1, 0, 1))
      return { start: toIso(first), end: toIso(today), preset }
    }
    case 'custom':
      return current ? { ...current, preset } : rangeFromPreset('thisMonth')
  }
}

/**
 * Pulls a range's end back to the last date with data behind it.
 *
 * Presets are built this way already; this catches the hand-picked ones. A
 * range extending into the future costs nothing upstream — the function clamps
 * it before querying — but it is still counted in full by everything derived
 * on this side of the boundary, and prorated operating costs are the clearest
 * case: days that have not happened are charged against trading that has.
 */
export function clampRangeToAvailable(range: DateRange): DateRange {
  const latest = latestAvailableDate()
  if (range.end <= latest) return range
  // A range starting after the latest date collapses onto it rather than
  // inverting, which would read as `start` after `end` everywhere downstream.
  return { ...range, start: range.start > latest ? latest : range.start, end: latest }
}

/** Inclusive day count. */
export function daysInRange(range: DateRange): number {
  const start = new Date(`${range.start}T00:00:00Z`).getTime()
  const end = new Date(`${range.end}T00:00:00Z`).getTime()
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1)
}

/** True when the range covers exactly one whole calendar month. */
export function isWholeMonth(range: DateRange): boolean {
  const start = new Date(`${range.start}T00:00:00Z`)
  const end = new Date(`${range.end}T00:00:00Z`)
  const lastOfMonth = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
  )
  return start.getUTCDate() === 1 && toIso(end) === toIso(lastOfMonth)
}

/**
 * The immediately preceding window of equal length — the delta baseline.
 * A whole-month selection compares against the previous whole month rather
 * than an N-day offset, which is what "previous period" means to a user
 * looking at a calendar month.
 */
export function previousRange(range: DateRange): DateRange {
  const start = new Date(`${range.start}T00:00:00Z`)
  if (isWholeMonth(range)) {
    const first = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1),
    )
    const last = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 0),
    )
    return { start: toIso(first), end: toIso(last), preset: 'custom' }
  }
  const len = daysInRange(range)
  return {
    start: toIso(addDays(start, -len)),
    end: toIso(addDays(start, -1)),
    preset: 'custom',
  }
}

/* ------------------------------ Comparison ------------------------------ */

/**
 * The same day of the month, N months earlier, falling back to month end where
 * the target month is shorter. Without the clamp, a range ending on the 31st
 * would roll forward into the next month and compare against the wrong window.
 */
function addMonthsClamped(iso: string, months: number): string {
  const at = new Date(`${iso}T00:00:00Z`)
  const month = at.getUTCMonth() + months
  const lastDay = new Date(Date.UTC(at.getUTCFullYear(), month + 1, 0)).getUTCDate()
  return toIso(
    new Date(Date.UTC(at.getUTCFullYear(), month, Math.min(at.getUTCDate(), lastDay))),
  )
}

/**
 * The same range shifted back whole calendar months, both ends together.
 *
 * A whole month keeps its shape without needing a special case: July 1–31 back
 * one month clamps to June 1–30, which is the whole of June.
 */
const shiftMonths = (range: DateRange, months: number): DateRange => ({
  start: addMonthsClamped(range.start, months),
  end: addMonthsClamped(range.end, months),
  preset: 'custom',
})

const shiftDays = (range: DateRange, days: number): DateRange => ({
  start: toIso(addDays(new Date(`${range.start}T00:00:00Z`), days)),
  end: toIso(addDays(new Date(`${range.end}T00:00:00Z`), days)),
  preset: 'custom',
})

/** What every delta was measured against before the comparison was selectable. */
export const DEFAULT_COMPARISON: Comparison = { mode: 'period' }

export const COMPARE_MODES: { id: CompareMode; label: string }[] = [
  { id: 'period', label: 'Period' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
  { id: 'custom', label: 'Custom' },
]

/**
 * The window `range` is measured against, or null when the comparison is off
 * and the dashboard should show figures without deltas.
 */
export function resolveComparison(
  range: DateRange,
  comparison: Comparison,
): DateRange | null {
  switch (comparison.mode) {
    case 'none':
      return null
    case 'period':
      return previousRange(range)
    case 'week':
      return shiftDays(range, -7)
    case 'month':
      return shiftMonths(range, -1)
    case 'year':
      return shiftMonths(range, -12)
    case 'custom':
      // An unanswered custom is still a comparison, so it falls back rather
      // than silently turning every delta off.
      return comparison.range ?? previousRange(range)
  }
}

/** `vs Jun 1, 2026 – Jun 30, 2026`, or nothing when the comparison is off. */
export function formatComparisonLabel(
  range: DateRange,
  comparison: Comparison,
): string {
  const against = resolveComparison(range, comparison)
  return against ? `vs ${formatRangeLabel(against)}` : ''
}

/** Every calendar day in the range, ascending. */
export function eachDay(range: DateRange): string[] {
  const out: string[] = []
  const end = new Date(`${range.end}T00:00:00Z`)
  let cursor = new Date(`${range.start}T00:00:00Z`)
  while (cursor.getTime() <= end.getTime()) {
    out.push(toIso(cursor))
    cursor = addDays(cursor, 1)
  }
  return out
}

/** `Jul 1, 2026 – Jul 31, 2026` */
export function formatRangeLabel(range: DateRange): string {
  if (range.start === range.end) return formatDate(range.start)
  return `${formatDate(range.start)} – ${formatDate(range.end)}`
}
