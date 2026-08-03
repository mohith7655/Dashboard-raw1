import { getStore } from '@netlify/blobs'
import type { CostCadence, CostCategory, OperatingCost } from '../../src/lib/types'
import { COST_CADENCES, COST_CATEGORIES } from '../../src/lib/types'
import { BadRequest, isRecord, jsonNoStore, num, toErrorResponse } from '../lib/http'

const STORE = 'dashboard'
const KEY = 'operating-costs'
const HINT =
  'Operating costs are stored on Netlify. If this keeps failing, confirm Blobs is enabled for the site.'

/**
 * The operating-cost list: `GET` reads it, `PUT` replaces it wholesale.
 *
 * The list is small and only ever edited by one person at a time, so replacing
 * it entirely avoids a per-row API and the merge conflicts that come with one.
 */
export default async function handler(request: Request): Promise<Response> {
  try {
    const store = getStore(STORE)

    if (request.method === 'GET') {
      const raw = await store.get(KEY, { type: 'json' })
      return jsonNoStore({ costs: readCosts(raw) })
    }

    if (request.method === 'PUT') {
      const body: unknown = await request.json().catch(() => {
        throw new BadRequest('Request body must be JSON')
      })
      if (!isRecord(body)) throw new BadRequest('Request body must be an object')

      const costs = readCosts(body.costs)
      await store.setJSON(KEY, costs)
      return jsonNoStore({ costs })
    }

    return jsonNoStore({ error: { message: 'Method not allowed' } }, 405)
  } catch (err) {
    return toErrorResponse(err, HINT)
  }
}

/**
 * Anything stored is re-validated on the way out as well as in: the blob is
 * hand-editable and outlives any given version of this code, so a row written
 * by an older shape must never reach the client half-formed.
 */
function readCosts(raw: unknown): OperatingCost[] {
  if (!Array.isArray(raw)) return []

  const costs: OperatingCost[] = []
  for (const row of raw) {
    if (!isRecord(row)) continue

    const name = typeof row.name === 'string' ? row.name.trim() : ''
    const id = typeof row.id === 'string' ? row.id : ''
    if (!name || !id) continue

    const cadence = readCadence(row.cadence)
    const cost: OperatingCost = {
      id,
      name: name.slice(0, 80),
      category: readCategory(row.category),
      // Negative costs would silently add profit; clamp rather than reject so
      // one bad row never blocks saving the rest of the list.
      amount: Math.max(0, num(row.amount)),
      cadence,
    }

    const date = readIsoDate(row.date)

    if (cadence === 'once') {
      // A one-off with no date has nowhere to land, so the row is dropped
      // rather than stored as a charge that can never count.
      if (!date) continue
      cost.date = date
    } else {
      // Optional here: it anchors the recurrence, and its absence means prorate
      // rather than being a missing field.
      if (date) cost.date = date

      // The window applies to recurring costs only — a one-off already carries
      // its own date, and a second pair of bounds around it would just be a way
      // to contradict it.
      const startDate = readIsoDate(row.startDate)
      const endDate = readIsoDate(row.endDate)
      if (startDate) cost.startDate = startDate
      if (endDate) cost.endDate = endDate
    }

    costs.push(cost)
  }

  return costs
}

/** `yyyy-MM-dd` or nothing; anything else is dropped rather than half-stored. */
function readIsoDate(raw: unknown): string | undefined {
  const date = typeof raw === 'string' ? raw.slice(0, 10) : ''
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined
}

function readCadence(raw: unknown): CostCadence {
  return COST_CADENCES.includes(raw as CostCadence)
    ? (raw as CostCadence)
    : 'monthly'
}

function readCategory(raw: unknown): CostCategory {
  return COST_CATEGORIES.includes(raw as CostCategory)
    ? (raw as CostCategory)
    : 'Other'
}
