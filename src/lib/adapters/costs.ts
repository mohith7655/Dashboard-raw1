import type { AdapterResult, OperatingCost } from '../types'
import { toResult } from './client'

const SOURCE = 'Operating costs'
const HINT =
  'The cost list could not be reached. Your edits are not saved until this succeeds.'
const ENDPOINT = '/.netlify/functions/costs'

interface CostsBody {
  costs?: OperatingCost[]
  error?: { message?: string }
}

async function request(init?: RequestInit): Promise<OperatingCost[]> {
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
    throw new Error('The cost store returned invalid JSON.')
  }

  if (!res.ok) {
    throw new Error(body.error?.message ?? `Request failed with status ${res.status}`)
  }
  return body.costs ?? []
}

export async function fetchCosts(): Promise<AdapterResult<OperatingCost[]>> {
  return toResult(SOURCE, HINT, () => request())
}

/** Replaces the whole list; the server echoes back what it stored. */
export async function saveCosts(costs: OperatingCost[]): Promise<OperatingCost[]> {
  return request({
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ costs }),
  })
}
