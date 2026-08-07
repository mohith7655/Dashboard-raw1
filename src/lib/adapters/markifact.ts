import type { AdapterResult, MarkifactAccount } from '../types'
import { toResult } from './client'

const SOURCE = 'Markifact'
const HINT =
  'Check MARKIFACT_API_KEY is a live key (`mk_live_…`) from your Markifact team workspace, set in Netlify and scoped to Functions. Then click Retry.'

/**
 * No date range: this reports the workspace as it stands — credits left,
 * connections authorised, and the most recent operations. The period picker
 * governs the store's figures, not the automation running beside them.
 */
export async function fetchAccount(): Promise<AdapterResult<MarkifactAccount>> {
  return toResult(SOURCE, HINT, async () => {
    const res = await fetch('/.netlify/functions/markifact')
    const text = await res.text()

    if (!(res.headers.get('content-type') ?? '').includes('application/json')) {
      throw new Error(
        'Netlify Functions are unavailable. Start local development with `npx netlify dev`.',
      )
    }

    const body = JSON.parse(text) as MarkifactAccount & { error?: { message?: string } }
    if (!res.ok) {
      throw new Error(body.error?.message ?? `Request failed with status ${res.status}`)
    }
    return body
  })
}
