import type { CompareMode, Comparison, DateRange, PresetId } from './types'

export interface DateFilterState {
  pickedRange: DateRange
  comparison: Comparison
  excludeToday: boolean
}

const STORAGE_KEY = 'ra1.dashboard.date-filter.v1'

const PRESET_IDS: readonly PresetId[] = [
  'today',
  'yesterday',
  'thisWeek',
  'lastWeek',
  'last7',
  'last30',
  'thisMonth',
  'lastMonth',
  'yearToDate',
  'allTime',
  'custom',
]

const COMPARE_MODES: readonly CompareMode[] = [
  'none',
  'period',
  'week',
  'month',
  'year',
  'custom',
]

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isDateRange(value: unknown): value is DateRange {
  return (
    isRecord(value) &&
    typeof value.start === 'string' &&
    typeof value.end === 'string' &&
    ISO_DATE.test(value.start) &&
    ISO_DATE.test(value.end) &&
    value.start <= value.end &&
    typeof value.preset === 'string' &&
    PRESET_IDS.includes(value.preset as PresetId)
  )
}

function isComparison(value: unknown): value is Comparison {
  if (!isRecord(value) || typeof value.mode !== 'string') return false
  if (!COMPARE_MODES.includes(value.mode as CompareMode)) return false
  return value.range === undefined || isDateRange(value.range)
}

/**
 * Restores the date controls after a browser or app restart. Invalid or old
 * saved data is deliberately ignored so it can never leave the dashboard with
 * an unusable range.
 */
export function loadDateFilter(): DateFilterState | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (
      !isRecord(value) ||
      !isDateRange(value.pickedRange) ||
      !isComparison(value.comparison) ||
      typeof value.excludeToday !== 'boolean'
    ) {
      return null
    }
    return {
      pickedRange: value.pickedRange,
      comparison: value.comparison,
      excludeToday: value.excludeToday,
    }
  } catch {
    // Storage may be unavailable in a private browser context. The picker
    // remains usable for this visit in that case.
    return null
  }
}

export function saveDateFilter(value: DateFilterState) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // A full or disabled local store must not prevent a date change.
  }
}
