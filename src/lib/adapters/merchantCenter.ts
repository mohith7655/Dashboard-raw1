import type { AdapterResult, MerchantFeed } from '../types'
import { toResult } from './client'

const SOURCE = 'Merchant Center'
const HINT =
  'The product feed comes from Merchant Center. Check GMC_MERCHANT_ID, that the Content API for Shopping is enabled, and that the Google refresh token carries the content scope — `npm run google:auth` mints one that does. Then click Retry.'

/**
 * No date range: a feed has a state rather than a history. `accountstatuses`
 * reports what is serving right now, so the period picker has nothing to say
 * to it and is not sent.
 */
export async function fetchFeed(): Promise<AdapterResult<MerchantFeed>> {
  return toResult(SOURCE, HINT, async () => {
    const res = await fetch('/.netlify/functions/merchant-center')
    const text = await res.text()

    if (!(res.headers.get('content-type') ?? '').includes('application/json')) {
      throw new Error(
        'Netlify Functions are unavailable. Start local development with `npx netlify dev`.',
      )
    }

    const body = JSON.parse(text) as MerchantFeed & { error?: { message?: string } }
    if (!res.ok) {
      throw new Error(body.error?.message ?? `Request failed with status ${res.status}`)
    }
    return body
  })
}
