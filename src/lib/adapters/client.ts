import type { DateRange, SourceError } from '../types'

/**
 * Fixtures are the default so `npm run dev` renders the full layout with no
 * credentials. Set `VITE_USE_FIXTURES=false` (and run `netlify dev`) to hit the
 * real connectors. Only the *switch* is a VITE_ variable — no secret ever is.
 */
export const USE_FIXTURES = import.meta.env.VITE_USE_FIXTURES !== 'false'

/**
 * In fixture mode, `?fail=meta` (repeatable) forces a source to fail so the
 * error banner and per-section degradation can be exercised without breaking a
 * live integration.
 */
export function isSimulatedFailure(source: 'metorik' | 'meta' | 'google-ads'): boolean {
  if (!USE_FIXTURES || typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).getAll('fail').includes(source)
}

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
  const res = await fetch(`/.netlify/functions/${name}?${params.toString()}`)

  if (!res.ok) {
    let body: FunctionErrorBody = {}
    try {
      body = (await res.json()) as FunctionErrorBody
    } catch {
      // Non-JSON failure (proxy error, HTML error page) — fall through.
    }
    throw new Error(
      body.error?.message ?? `Request failed with status ${res.status}`,
    )
  }

  return (await res.json()) as T
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

/** Small delay so fixture mode exercises the skeleton states realistically. */
export const fixtureDelay = (ms = 350): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))
