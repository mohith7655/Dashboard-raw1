import type { AdapterResult, AdsMetrics, DateRange } from '../types'
import { callFunction, compareParams, toResult } from './client'

const SOURCE = 'Google Ads'
const HINT =
  'The Google Ads connector could not be reached. Check the OAuth refresh token in your Netlify environment, then click Retry.'

export async function fetchMetrics(
  range: DateRange,
  against: DateRange | null,
): Promise<AdapterResult<AdsMetrics>> {
  return toResult(SOURCE, HINT, () =>
    callFunction<AdsMetrics>('google-ads', range, compareParams(against)),
  )
}
