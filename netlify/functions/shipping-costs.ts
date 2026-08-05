import { getStore } from '@netlify/blobs'
import type { CountryShippingCost, ShippingCostBasis } from '../../src/lib/types'
import { SHIPPING_COST_BASES } from '../../src/lib/types'
import { BadRequest, isRecord, jsonNoStore, num, toErrorResponse } from '../lib/http'

const STORE = 'dashboard'
const KEY = 'shipping-costs'
const HINT =
  'Shipping surcharges are stored on Netlify. If this keeps failing, confirm Blobs is enabled for the site.'

/**
 * The per-country shipping surcharges: `GET` reads them, `PUT` replaces them.
 *
 * Same shape as the operating-cost store and for the same reason — the list is
 * small, one person edits it at a time, and replacing it whole avoids a
 * per-row API and the merge conflicts that come with one.
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
 * Re-validated on the way out as well as in: the blob is hand-editable and
 * outlives any given version of this code.
 */
function readCosts(raw: unknown): CountryShippingCost[] {
  if (!Array.isArray(raw)) return []

  const costs: CountryShippingCost[] = []
  for (const row of raw) {
    if (!isRecord(row)) continue

    const id = typeof row.id === 'string' ? row.id : ''
    // Upper-cased on the way through so a hand-written `au` still matches the
    // `AU` the order splits are keyed under.
    const country =
      typeof row.country === 'string' ? row.country.trim().toUpperCase() : ''
    // A surcharge with no destination cannot be applied to one, so the row is
    // dropped rather than stored as a charge that can never count.
    if (!id || !country) continue

    costs.push({
      id,
      country: country.slice(0, 8),
      label: typeof row.label === 'string' ? row.label.trim().slice(0, 80) : '',
      // Negative surcharges would quietly add profit; clamp rather than reject
      // so one bad row never blocks saving the rest of the list.
      amount: Math.max(0, num(row.amount)),
      basis: readBasis(row.basis),
    })
  }

  return costs
}

function readBasis(raw: unknown): ShippingCostBasis {
  return SHIPPING_COST_BASES.includes(raw as ShippingCostBasis)
    ? (raw as ShippingCostBasis)
    : 'per-order'
}
