import type { AdapterResult, AdsMetrics, DateRange } from '../types'
import { callFunction, compareParams, toResult } from './client'

const SOURCE = 'OpenAI Ads'
const HINT =
  'The OpenAI Ads connector could not be reached. Check OPENAI_ADS_API_KEY in your Netlify environment — it is an Ads key scoped to one ad account, not the key the Insights tab uses. Then click Retry.'

export async function fetchMetrics(
  range: DateRange,
  against: DateRange | null,
): Promise<AdapterResult<AdsMetrics>> {
  return toResult(SOURCE, HINT, () =>
    callFunction<AdsMetrics>('openai-ads', range, compareParams(against)),
  )
}
