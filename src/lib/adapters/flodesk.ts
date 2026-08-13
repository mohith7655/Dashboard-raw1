import type { AdapterResult, DateRange, FlodeskReport } from '../types'
import { callFunction, toResult } from './client'

const SOURCE = 'Flodesk'
const HINT =
  'Flodesk list health comes from the Flodesk API. Check FLODESK_API_KEY is a current key — Flodesk → Account → Integrations → Flodesk API. Then click Retry.'

/**
 * No comparison window is sent. Nothing Flodesk returns is scoped to one: the
 * subscriber counts are current state and the campaign list is filtered on a
 * timestamp the API does not let it query by.
 */
export async function fetchFlodesk(
  range: DateRange,
): Promise<AdapterResult<FlodeskReport>> {
  return toResult(SOURCE, HINT, () => callFunction<FlodeskReport>('flodesk', range))
}
