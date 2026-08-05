import type { AdapterResult, CountryShippingCost } from '../types'
import { toResult } from './client'

const SOURCE = 'Shipping surcharges'
const HINT =
  'The shipping surcharge list could not be reached. Your edits are not saved until this succeeds.'
const ENDPOINT = '/.netlify/functions/shipping-costs'

interface CostsBody {
  costs?: CountryShippingCost[]
  error?: { message?: string }
}

async function request(init?: RequestInit): Promise<CountryShippingCost[]> {
  const res = await fetch(ENDPOINT, init)
  const text = await res.text()

  if (!(res.headers.get('content-type') ?? '').includes('application/json')) {
    throw new Error(
      'Netlify Functions are unavailable. Start local development with `npx netlify dev`.',
    )
  }

  let body: CostsBody = {}
  try {
    body = JSON.parse(text) as CostsBody
  } catch {
    throw new Error('The shipping surcharge store returned invalid JSON.')
  }

  if (!res.ok) {
    throw new Error(body.error?.message ?? `Request failed with status ${res.status}`)
  }
  return body.costs ?? []
}

export async function fetchShippingCosts(): Promise<AdapterResult<CountryShippingCost[]>> {
  return toResult(SOURCE, HINT, () => request())
}

/** Replaces the whole list; the server echoes back what it stored. */
export async function saveShippingCosts(
  costs: CountryShippingCost[],
): Promise<CountryShippingCost[]> {
  return request({
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ costs }),
  })
}
