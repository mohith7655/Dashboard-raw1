import type { AdapterResult, DateRange, Ga4Dimension, Ga4Report } from '../types'
import { callFunction, toResult } from './client'

const SOURCE = 'Google Analytics'
const HINT =
  'Check GA4_PROPERTY_ID and that the Google refresh token carries the analytics.readonly scope, then click Retry.'

export async function fetchReport(
  range: DateRange,
  dimension: Ga4Dimension,
): Promise<AdapterResult<Ga4Report>> {
  return toResult(SOURCE, HINT, () =>
    callFunction<Ga4Report>('ga4', range, { dimension }),
  )
}
