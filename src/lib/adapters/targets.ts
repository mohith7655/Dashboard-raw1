import type { AdapterResult, Target } from '../types'
import { toResult } from './client'

const SOURCE = 'Targets'
const HINT =
  'The target list could not be reached. Your edits are not saved until this succeeds.'
const ENDPOINT = '/.netlify/functions/targets'

interface TargetsBody {
  targets?: Target[]
  error?: { message?: string }
}

async function request(init?: RequestInit): Promise<Target[]> {
  const res = await fetch(ENDPOINT, init)
  const text = await res.text()

  if (!(res.headers.get('content-type') ?? '').includes('application/json')) {
    throw new Error(
      'Netlify Functions are unavailable. Start local development with `npx netlify dev`.',
    )
  }

  let body: TargetsBody = {}
  try {
    body = JSON.parse(text) as TargetsBody
  } catch {
    throw new Error('The target store returned invalid JSON.')
  }

  if (!res.ok) {
    throw new Error(body.error?.message ?? `Request failed with status ${res.status}`)
  }
  return body.targets ?? []
}

export async function fetchTargets(): Promise<AdapterResult<Target[]>> {
  return toResult(SOURCE, HINT, () => request())
}

/** Replaces the whole list; the server echoes back what it stored. */
export async function saveTargets(targets: Target[]): Promise<Target[]> {
  return request({
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ targets }),
  })
}
