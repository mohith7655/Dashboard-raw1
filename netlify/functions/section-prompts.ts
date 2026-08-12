import { getStore } from '@netlify/blobs'
import type { SectionPromptKey, SectionPrompts } from '../../src/lib/types'
import { SECTION_PROMPT_KEYS } from '../../src/lib/types'
import { BadRequest, isRecord, jsonNoStore, toErrorResponse } from '../lib/http'

const STORE = 'dashboard'
const KEY = 'sectionPrompts'
const HINT =
  'Section prompts are stored on Netlify. If this keeps failing, confirm Blobs is enabled for the site.'

/**
 * Long enough for a paragraph of standing instruction, short enough that it
 * cannot crowd out the rules it is appended to — the analysis prompt carries
 * the same cap on the way to the model.
 */
const MAX_CHARS = 2000

/**
 * What each section's analysis should pay attention to, in the reader's own
 * words.
 *
 * Stored beside the targets and operating costs rather than in the browser, on
 * the same grounds: what this store's owner wants watched is a fact about the
 * business, not about the machine it was typed on, and a prompt that lived in
 * one laptop's storage would be gone the first time the dashboard was opened
 * anywhere else.
 */
export default async function handler(request: Request): Promise<Response> {
  try {
    const store = getStore(STORE)

    if (request.method === 'GET') {
      const raw = await store.get(KEY, { type: 'json' })
      return jsonNoStore({ prompts: readPrompts(raw) })
    }

    if (request.method === 'PUT') {
      const body: unknown = await request.json().catch(() => {
        throw new BadRequest('Request body must be JSON')
      })
      if (!isRecord(body)) throw new BadRequest('Request body must be an object')

      const prompts = readPrompts(body.prompts)
      await store.setJSON(KEY, prompts)
      return jsonNoStore({ prompts })
    }

    return jsonNoStore({ error: { message: 'Method not allowed' } }, 405)
  } catch (err) {
    return toErrorResponse(err, HINT)
  }
}

/**
 * Re-validated on the way out as well as in: the blob is hand-editable and
 * outlives any given version of this code.
 *
 * Only the sections this build knows about survive. A key for a section that
 * has since been removed is dropped rather than carried, so the store cannot
 * accumulate prompts for cards nobody can see.
 */
function readPrompts(raw: unknown): SectionPrompts {
  const prompts: SectionPrompts = {}
  if (!isRecord(raw)) return prompts

  for (const key of SECTION_PROMPT_KEYS) {
    const value = raw[key]
    if (typeof value !== 'string') continue
    const trimmed = value.trim().slice(0, MAX_CHARS)
    // An empty prompt is the absence of one. Stored as a key with an empty
    // string it would read as "written and then cleared", which the editor
    // would show as a saved prompt that says nothing.
    if (trimmed) prompts[key as SectionPromptKey] = trimmed
  }

  return prompts
}
