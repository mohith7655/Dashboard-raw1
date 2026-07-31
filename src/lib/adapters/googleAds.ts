import type { AdapterResult, AdsMetrics, DateRange } from '../types'
import { buildGoogleAdsFixture } from '../fixtures'
import {
  USE_FIXTURES,
  callFunction,
  fixtureDelay,
  isSimulatedFailure,
  toResult,
} from './client'

const SOURCE = 'Google Ads'
const HINT =
  'The Google Ads connector could not be reached. Check the OAuth refresh token in your Netlify environment, then click Retry.'

export async function fetchMetrics(range: DateRange): Promise<AdapterResult<AdsMetrics>> {
  return toResult(SOURCE, HINT, async () => {
    if (USE_FIXTURES) {
      await fixtureDelay(650)
      if (isSimulatedFailure('google-ads')) {
        throw new Error(
          'Google Ads API error (UNAUTHENTICATED): Request had invalid authentication credentials. Expected OAuth 2 access token.',
        )
      }
      return buildGoogleAdsFixture(range)
    }
    return callFunction<AdsMetrics>('google-ads', range)
  })
}
