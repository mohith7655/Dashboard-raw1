import { getStore } from '@netlify/blobs'
import type { Target, TargetAim, TargetGoal } from '../../src/lib/types'
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

    const aims = readAims(row)
    // A target with nothing to reach has no arithmetic in it. Dropped rather
    // than defaulted: inventing an aim would put a figure on the card that
    // nobody set.
    if (aims.length === 0) continue

    const deadline = readIsoDate(row.deadline) ?? defaultDeadline()

    targets.push({
      id,
      name: name.slice(0, 80),
      aims,
      // A share of sales, so it is bounded at both ends. Over 100% is not a
      // budget, it is a typo that would recommend spending more than the goal.
      budgetPct: Math.min(100, Math.max(0, num(row.budgetPct))),
      // Rows written before targets had a window get today, which makes them
      // exactly what they were: a target running from now to its date.
      //
      // Clamped to the deadline rather than rejected when it falls after one,
      // so a mistyped year cannot produce a window of negative length for the
      // rates to divide by.
      start: earliest(readIsoDate(row.start) ?? today(), deadline),
      // Defaults on where a row predates the option. Advertising is bought by
      // the month, and a target set mid-month that ignored what the month had
      // already spent showed a budget with more left in it than the account
      // had — which is the behaviour these rows were written expecting.
      countFromMonthStart: row.countFromMonthStart !== false,
      deadline,
    })

    if (targets.length >= MAX_TARGETS) break
  }

  return targets
}

/**
 * The aims on a row, one per goal.
 *
 * Rows written before a target could carry more than one aim have `goal` and
 * `amount` at the top level instead, and are read forward here. That legacy
 * `sales` was measured against total revenue — what the store kept — so it
 * migrates to `revenue` rather than to the `sales` goal that now exists
 * beside it: keeping the label would quietly re-point every stored target at a
 * wider figure and show it losing ground it never held.
 */
function readAims(row: Record<string, unknown>): TargetAim[] {
  const raw = Array.isArray(row.aims)
    ? row.aims
    : [{ goal: row.goal === 'roas' ? 'roas' : 'revenue', amount: row.amount }]

  const aims: TargetAim[] = []
  for (const entry of raw) {
    if (!isRecord(entry)) continue
    const goal = readGoal(entry.goal)
    // Dropped rather than defaulted. A goal this code does not know is a goal
    // it cannot do arithmetic on, and coercing it to a real one would let a
    // stray row overwrite the aim beside it — `{goal:"sales2", amount:5}`
    // landing on revenue and replacing 50,000 with 5.
    if (goal === null) continue

    // One aim per goal: two figures for the same measure cannot both be the
    // target, and the last one written is the one that was meant.
    const found = aims.findIndex((aim) => aim.goal === goal)
    const aim: TargetAim = {
      goal,
      // Clamped rather than rejected, so one bad figure never blocks saving the
      // rest of the list. A negative target is not a smaller one; it is a typo.
      amount: Math.max(0, num(entry.amount)),
    }
    if (found === -1) aims.push(aim)
    else aims[found] = aim
  }

  return aims.slice(0, TARGET_GOALS.length)
}

/** The goal as written, or null where it is not one this code can plan against. */
function readGoal(raw: unknown): TargetGoal | null {
  return TARGET_GOALS.includes(raw as TargetGoal) ? (raw as TargetGoal) : null
}

/** `yyyy-MM-dd` or nothing; anything else is dropped rather than half-stored. */
function readIsoDate(raw: unknown): string | undefined {
  const date = typeof raw === 'string' ? raw.slice(0, 10) : ''
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined
}

/** `yyyy-MM-dd` sorts lexically, so the earlier of two is the smaller string. */
const earliest = (a: string, b: string): string => (a < b ? a : b)

const today = (): string => new Date().toISOString().slice(0, 10)

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
