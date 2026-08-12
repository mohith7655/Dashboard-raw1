/**
 * One section's own handling of today.
 *
 * The header's picker sets the period for the whole page, and that stays the
 * one place a period is chosen — a second picker per section would let two
 * cards quietly describe different months while sitting an inch apart. What a
 * section does get is its own answer to the part-day question: today is
 * incomplete, and whether that matters is a different judgement for spend than
 * for the statement it is set against.
 *
 * Off by default. Until the toggle is used the section follows the page, and —
 * because the queries are keyed on the range — follows it out of the same
 * cache entry, with no second request.
 */
import { useMemo, useState } from 'react'
import type { Comparison, DateRange } from '../lib/types'
import { resolveComparison, withoutToday } from '../lib/dateRange'
import { TodayToggle } from './TodayToggle'

export interface SectionRange {
  /** What the section's queries should use, after the today-trim. */
  range: DateRange
  /** What that is compared against, or null when comparison is off. */
  against: DateRange | null
  /** True while the section is leaving today out and the page is not. */
  overridden: boolean
  /** Everything the control needs; spread onto `SectionRangeControl`. */
  control: SectionRangeControlProps
}

export interface SectionRangeControlProps {
  range: DateRange
  excludeToday: boolean
  onExcludeTodayChange: (exclude: boolean) => void
}

/**
 * Section-level today handling, over the page's period.
 *
 * `pageRange` is the page's *effective* range — the header's own today-trim is
 * already in it — so a section that has not been touched inherits that too,
 * and its own toggle is a further trim rather than a contradicting one.
 */
export function useSectionRange(
  pageRange: DateRange,
  pageComparison: Comparison,
): SectionRange {
  const [excludeToday, setExcludeToday] = useState(false)

  const range = useMemo(
    () => (excludeToday ? withoutToday(pageRange) : pageRange),
    [pageRange, excludeToday],
  )

  // The comparison shortens with the range, so both sides stay the same length
  // — the whole point of dropping the part-day in the first place.
  const against = useMemo(
    () => resolveComparison(range, pageComparison),
    [range, pageComparison],
  )

  return {
    range,
    against,
    overridden: excludeToday,
    control: { range, excludeToday, onExcludeTodayChange: setExcludeToday },
  }
}

/** The today toggle, sized for a section's title row. */
export function SectionRangeControl({
  range,
  excludeToday,
  onExcludeTodayChange,
}: SectionRangeControlProps) {
  return (
    <TodayToggle
      range={range}
      excludeToday={excludeToday}
      onChange={onExcludeTodayChange}
      size="sm"
    />
  )
}
