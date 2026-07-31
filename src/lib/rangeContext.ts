import { createContext, useContext } from 'react'
import type { DateRange } from './types'
import { rangeFromPreset } from './dateRange'

export interface RangeContextValue {
  range: DateRange
  setRange: (range: DateRange) => void
}

/**
 * The selected range is shell-level state: the header picker sets it and every
 * page reads it, so navigating between pages keeps the same period.
 */
export const RangeContext = createContext<RangeContextValue>({
  range: rangeFromPreset('thisMonth'),
  setRange: () => {},
})

export const useRange = (): RangeContextValue => useContext(RangeContext)
