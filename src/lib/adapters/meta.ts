import type { AdapterResult, AdsMetrics, DateRange } from '../types'
import { buildMetaFixture } from '../fixtures'
import {
  USE_FIXTURES,
  callFunction,
  fixtureDelay,
  isSimulatedFailure,
  toResult,
} from './client'

const SOURCE = 'Facebook Ads'
const HINT = 'This is a session issue. Please refresh the page or click Retry.'

export async function fetchMetrics(range: DateRange): Promise<AdapterResult<AdsMetrics>> {
  return toResult(SOURCE, HINT, async () => {
    if (USE_FIXTURES) {
      await fixtureDelay(500)
      if (isSimulatedFailure('meta')) {
        // Verbatim shape of a real expired-token response, so the banner can be
        // reviewed against the case it was designed for.
        throw new Error(
          'Facebook API error (190): Error validating access token: Session has expired on Wednesday, 29-Jul-26 14:00:00 PDT. The current time is Friday, 31-Jul-26 10:34:26 PDT.',
        )
      }
      return buildMetaFixture(range)
    }
    return callFunction<AdsMetrics>('meta', range)
  })
}
