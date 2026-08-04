import type { DateRange, SourceError } from '../types'

/** Thrown by query functions so TanStack Query can retry the failed source. */
export class SourceFailure extends Error {
  readonly sourceError: SourceError

  constructor(sourceError: SourceError) {
    super(sourceError.message)
    this.name = 'SourceFailure'
    this.sourceError = sourceError
  }
}

interface FunctionErrorBody {
  error?: { message?: string; hint?: string }
}

/**
 * Calls a Netlify Function and returns its JSON. Secrets live only in the
 * function's environment; the browser never sees them.
 */
export async function callFunction<T>(
  name: string,
  range: DateRange,
  extra: Record<string, string> = {},
): Promise<T> {
  const params = new URLSearchParams({ start: range.start, end: range.end, ...extra })
  return readJson<T>(await fetch(`/.netlify/functions/${name}?${params.toString()}`))
}

/**
 * The comparison window as query params.
 *
 * Resolved in the browser rather than named by mode, so the function receives
 * two dates and never has to agree with the client about what `month` means.
 * Null is sent explicitly — omitting it would read as "unspecified", which the
 * function answers with the previous period.
 */
export const compareParams = (against: DateRange | null): Record<string, string> =>
  against
    ? { compareStart: against.start, compareEnd: against.end }
    : { compare: 'none' }

/**
 * Same contract as `callFunction`, for the one endpoint that sends a body up
 * rather than reading a range off the query string.
 */
export async function postFunction<T>(name: string, body: unknown): Promise<T> {
  const res = await fetch(`/.netlify/functions/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return readJson<T>(res)
}

async function readJson<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') ?? ''
  const bodyText = await res.text()

  if (!contentType.includes('application/json')) {
    throw new Error(
      'Netlify Functions are unavailable. Start local development with `npm run dev` and open the Netlify URL it prints.',
    )
  }

  let body: FunctionErrorBody = {}
  try {
    body = JSON.parse(bodyText) as FunctionErrorBody
  } catch {
    throw new Error('The Netlify Function returned invalid JSON.')
  }

  if (!res.ok) {
    throw new Error(body.error?.message ?? `Request failed with status ${res.status}`)
  }

  return body as T
}

/** Wraps a fetch so every adapter resolves to the same `{ data, error }` shape. */
export async function toResult<T>(
  source: string,
  hint: string,
  load: () => Promise<T>,
): Promise<{ data: T | null; error: SourceError | null }> {
  try {
    return { data: await load(), error: null }
  } catch (err) {
    return {
      data: null,
      error: {
        source,
        message: err instanceof Error ? err.message : String(err),
        hint,
      },
    }
  }
}
