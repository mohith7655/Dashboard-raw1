import { getStore } from '@netlify/blobs'
import type { Target, TargetGoal } from '../../src/lib/types'
import { TARGET_GOALS } from '../../src/lib/types'
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
      // A share of sales, so it is bounded at both ends. Over 100% is not a
      // budget, it is a typo that would recommend spending more than the goal.
      budgetPct: Math.min(100, Math.max(0, num(row.budgetPct))),
      deadline: readIsoDate(row.deadline) ?? defaultDeadline(),
    })

    if (targets.length >= MAX_TARGETS) break
  }

  return targets
}

function readGoal(raw: unknown): TargetGoal {
  return TARGET_GOALS.includes(raw as TargetGoal) ? (raw as TargetGoal) : 'sales'
}

/** `yyyy-MM-dd` or nothing; anything else is dropped rather than half-stored. */
function readIsoDate(raw: unknown): string | undefined {
  const date = typeof raw === 'string' ? raw.slice(0, 10) : ''
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined
}

/**
 * A month out, for a row stored before deadlines existed or with an unreadable
 * one. A target with no date cannot be divided into a daily rate at all, and a
 * plausible date beats dropping the row the operator wrote.
 */
function defaultDeadline(): string {
  const date = new Date()
  date.setUTCMonth(date.getUTCMonth() + 1)
  return date.toISOString().slice(0, 10)
}
