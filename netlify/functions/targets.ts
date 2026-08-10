import { getStore } from '@netlify/blobs'
import type { Target, TargetGoal, TargetHorizon } from '../../src/lib/types'
import { TARGET_GOALS, TARGET_HORIZONS } from '../../src/lib/types'
import { BadRequest, isRecord, jsonNoStore, num, toErrorResponse } from '../lib/http'

const STORE = 'dashboard'
const KEY = 'targets'
const HINT =
  'Targets are stored on Netlify. If this keeps failing, confirm Blobs is enabled for the site.'

/** A short list, edited by one person at a time — see `costs.ts` for the reasoning. */
const MAX_TARGETS = 12

/**
 * The target list: `GET` reads it, `PUT` replaces it wholesale.
 *
 * Stored beside the operating costs rather than in the browser, on the same
 * grounds: a target is a statement about the business, not about the machine it
 * was typed on, and the scheduled Insights run has no session to read a browser
 * store from.
 */
export default async function handler(request: Request): Promise<Response> {
  try {
    const store = getStore(STORE)

    if (request.method === 'GET') {
      const raw = await store.get(KEY, { type: 'json' })
      return jsonNoStore({ targets: readTargets(raw) })
    }

    if (request.method === 'PUT') {
      const body: unknown = await request.json().catch(() => {
        throw new BadRequest('Request body must be JSON')
      })
      if (!isRecord(body)) throw new BadRequest('Request body must be an object')

      const targets = readTargets(body.targets)
      await store.setJSON(KEY, targets)
      return jsonNoStore({ targets })
    }

    return jsonNoStore({ error: { message: 'Method not allowed' } }, 405)
  } catch (err) {
    return toErrorResponse(err, HINT)
  }
}

/**
 * Re-validated on the way out as well as in: the blob is hand-editable and
 * outlives any given version of this code, so a row written by an older shape
 * must never reach the client half-formed.
 */
function readTargets(raw: unknown): Target[] {
  if (!Array.isArray(raw)) return []

  const targets: Target[] = []
  for (const row of raw) {
    if (!isRecord(row)) continue

    const id = typeof row.id === 'string' ? row.id : ''
    const name = typeof row.name === 'string' ? row.name.trim() : ''
    if (!id || !name) continue

    targets.push({
      id,
      name: name.slice(0, 80),
      goal: readGoal(row.goal),
      // Clamped rather than rejected, so one bad figure never blocks saving the
      // rest of the list. A negative target is not a smaller one; it is a typo.
      amount: Math.max(0, num(row.amount)),
      budget: Math.max(0, num(row.budget)),
      horizon: readHorizon(row.horizon),
    })

    if (targets.length >= MAX_TARGETS) break
  }

  return targets
}

function readGoal(raw: unknown): TargetGoal {
  return TARGET_GOALS.includes(raw as TargetGoal) ? (raw as TargetGoal) : 'sales'
}

function readHorizon(raw: unknown): TargetHorizon {
  return TARGET_HORIZONS.includes(raw as TargetHorizon)
    ? (raw as TargetHorizon)
    : 'monthly'
}
