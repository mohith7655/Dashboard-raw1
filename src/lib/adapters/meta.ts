import type { AdapterResult, AdsMetrics, DateRange } from '../types'
import { callFunction, toResult } from './client'

const SOURCE = 'Facebook Ads'
const HINT = 'This is a session issue. Please refresh the page or click Retry.'

export async function fetchMetrics(range: DateRange): Promise<AdapterResult<AdsMetrics>> {
  return toResult(SOURCE, HINT, () => callFunction<AdsMetrics>('meta', range))
}
