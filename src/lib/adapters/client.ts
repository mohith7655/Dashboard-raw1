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
  const res = await fetch(`/.netlify/functions/${name}?${params.toString()}`)

  if (!res.ok) {
    let body: FunctionErrorBody = {}
    try {
      body = (await res.json()) as FunctionErrorBody
    } catch {
      // Non-JSON failure (proxy error, HTML error page) — fall through.
    }
    throw new Error(body.error?.message ?? `Request failed with status ${res.status}`)
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
