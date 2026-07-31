import type { DateRange } from '../../src/lib/types'

/** Error body contract shared by every function; the client reads `error.message`. */
export interface ErrorBody {
  error: { message: string; hint?: string }
}

const JSON_HEADERS = {
  'content-type': 'application/json',
  // Metrics change slowly; let the CDN absorb repeat loads of the same range.
  'cache-control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

/**
 * Upstream failures are passed through with their original message intact —
 * operators need the real text (error codes, token expiry times) to act on it.
 */
export function errorResponse(message: string, status = 502, hint?: string): Response {
  const body: ErrorBody = { error: hint ? { message, hint } : { message } }
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export class BadRequest extends Error {}

/** Reads and validates `?start=&end=` off the request URL. */
export function readRange(url: URL): DateRange {
  const start = url.searchParams.get('start')
  const end = url.searchParams.get('end')
  if (!start || !ISO_DATE.test(start) || !end || !ISO_DATE.test(end)) {
    throw new BadRequest('`start` and `end` are required and must be yyyy-MM-dd')
  }
  if (start > end) throw new BadRequest('`start` must not be after `end`')
  return { start, end, preset: 'custom' }
}

/** Reads a required secret, failing loudly rather than calling an API without it. */
export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new MissingConfig(
      `${name} is not set. Add it in Netlify under Project configuration → Environment variables (scoped to Functions) and redeploy.`,
    )
  }
  return value
}

export class MissingConfig extends Error {}

/** Maps a thrown error onto the right status code and message. */
export function toErrorResponse(err: unknown, hint?: string): Response {
  if (err instanceof BadRequest) return errorResponse(err.message, 400)
  if (err instanceof MissingConfig) return errorResponse(err.message, 500, hint)
  return errorResponse(err instanceof Error ? err.message : String(err), 502, hint)
}

export const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null

export const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
