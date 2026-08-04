import { createContext, useContext } from 'react'
import type { Comparison, DateRange } from './types'
import { DEFAULT_COMPARISON, rangeFromPreset, resolveComparison } from './dateRange'

export interface RangeContextValue {
  range: DateRange
  setRange: (range: DateRange) => void
  comparison: Comparison
  setComparison: (comparison: Comparison) => void
  /**
   * `comparison` already resolved against `range` — the window every delta is
   * measured against, or null when the comparison is off. Pages read this
   * rather than resolving it themselves, so they cannot disagree about what
   * `month` means for the range currently on screen.
   */
  against: DateRange | null
}

/**
 * The selected range is shell-level state: the header picker sets it and every
 * page reads it, so navigating between pages keeps the same period. What that
 * period is measured against travels with it for the same reason.
 */
export const RangeContext = createContext<RangeContextValue>({
  range: rangeFromPreset('thisMonth'),
  setRange: () => {},
  comparison: DEFAULT_COMPARISON,
  setComparison: () => {},
  against: resolveComparison(rangeFromPreset('thisMonth'), DEFAULT_COMPARISON),
})

export const useRange = (): RangeContextValue => useContext(RangeContext)
