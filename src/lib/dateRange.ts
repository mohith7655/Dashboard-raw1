import type { DateRange, PresetId } from './types'
import { formatDate } from './format'

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

function utcToday(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000)
}

export function rangeFromPreset(preset: PresetId, current?: DateRange): DateRange {
  const today = utcToday()
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
      const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
      const last = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0),
      )
      return { start: toIso(first), end: toIso(last), preset }
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
