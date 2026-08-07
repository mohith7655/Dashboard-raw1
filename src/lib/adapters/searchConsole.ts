import type { AdapterResult, DateRange, GscDimension, GscReport } from '../types'
import { callFunction, compareParams, toResult } from './client'

const SOURCE = 'Search Console'
const HINT =
  'Organic search comes from Search Console. Check GSC_SITE_URL names a property you own, and that the Google refresh token carries the webmasters.readonly scope — `npm run google:auth` mints one that does. Then click Retry.'

export async function fetchReport(
  range: DateRange,
  dimension: GscDimension,
  against: DateRange | null,
): Promise<AdapterResult<GscReport>> {
  return toResult(SOURCE, HINT, () =>
    callFunction<GscReport>('search-console', range, {
      dimension,
      ...compareParams(against),
    }),
  )
}
