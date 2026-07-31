import type { AdapterResult, AdsMetrics, DateRange } from '../types'
import { callFunction, toResult } from './client'

const SOURCE = 'Google Ads'
const HINT =
  'The Google Ads connector could not be reached. Check the OAuth refresh token in your Netlify environment, then click Retry.'

export async function fetchMetrics(range: DateRange): Promise<AdapterResult<AdsMetrics>> {
  return toResult(SOURCE, HINT, () => callFunction<AdsMetrics>('google-ads', range))
}
