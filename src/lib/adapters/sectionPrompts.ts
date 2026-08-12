import type { AdapterResult, SectionPrompts } from '../types'
import { toResult } from './client'

const SOURCE = 'Section prompts'
const HINT =
  'The saved prompts could not be reached. Your edits are not saved until this succeeds.'
const ENDPOINT = '/.netlify/functions/section-prompts'

interface PromptsBody {
  prompts?: SectionPrompts
  error?: { message?: string }
}

async function request(init?: RequestInit): Promise<SectionPrompts> {
  const res = await fetch(ENDPOINT, init)
  const text = await res.text()

  if (!(res.headers.get('content-type') ?? '').includes('application/json')) {
    throw new Error(
      'Netlify Functions are unavailable. Start local development with `npx netlify dev`.',
    )
  }

  let body: PromptsBody = {}
  try {
    body = JSON.parse(text) as PromptsBody
  } catch {
    throw new Error('The prompt store returned invalid JSON.')
  }

  if (!res.ok) {
    throw new Error(body.error?.message ?? `Request failed with status ${res.status}`)
  }
  return body.prompts ?? {}
}

export async function fetchSectionPrompts(): Promise<AdapterResult<SectionPrompts>> {
  return toResult(SOURCE, HINT, () => request())
}

/** Replaces the whole set; the server echoes back what it stored. */
export async function saveSectionPrompts(
  prompts: SectionPrompts,
): Promise<SectionPrompts> {
  return request({
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompts }),
  })
}
