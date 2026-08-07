import type {
  MarkifactAccount,
  MarkifactConnection,
  MarkifactCredits,
  MarkifactLog,
  MarkifactOperationRollup,
} from '../../src/lib/types'
import { asArray, isRecord, json, num, requireEnv, toErrorResponse } from '../lib/http'

const API = 'https://api.markifact.com/v1'
const SOURCE = 'Markifact'
const HINT =
  'Markifact could not be reached. Check MARKIFACT_API_KEY is a live key (`mk_live_…`) from your team workspace. Then click Retry.'

/**
 * How many log entries to read. One page is enough to rank what runs and what
 * it costs; the whole history is not what this panel is for.
 */
const LOG_LIMIT = 100

/**
 * The Markifact workspace itself: what is connected, what the agents have been
 * running, and what it is costing.
 *
 * Not marketing metrics — Markifact's REST API does not carry any. Its 500+
 * operations are reachable only over MCP, which authenticates with OAuth 2.1
 * and rejects the `mk_live_` key a function can hold; the REST surface is nine
 * endpoints covering connections, credits and operation logs. So this reports
 * the automation rather than the advertising: which platforms are still
 * authorised, how much of the credit allowance is left, and which operations
 * are burning it or failing.
 */
export default async function handler(): Promise<Response> {
  try {
    const key = requireEnv('MARKIFACT_API_KEY')

    // Independent reads — one failing endpoint should not blank the panel.
    const [credits, connections, logs] = await Promise.all([
      get<Record<string, unknown>>('/credits', key),
      get<unknown>('/connections', key),
      get<Record<string, unknown>>(`/logs?limit=${LOG_LIMIT}`, key),
    ])

    const entries = readLogs(logs.data)
    const account: MarkifactAccount = {
      credits: readCredits(credits),
      connections: readConnections(connections),
      logs: entries,
      operations: rollUp(entries),
    }
    return json(account)
  } catch (err) {
    return toErrorResponse(err, HINT)
  }
}

async function get<T>(path: string, key: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
  })

  const text = await res.text()
  let body: unknown
  try {
    body = JSON.parse(text) as unknown
  } catch {
    throw new Error(`${SOURCE} API error (${res.status}): ${text.slice(0, 200)}`)
  }

  if (!res.ok) {
    const record = isRecord(body) ? body : {}
    const message =
      typeof record.error === 'string'
        ? record.error
        : typeof record.message === 'string'
          ? record.message
          : `request failed (${res.status})`
    // 401 here means the key itself, which is worth saying rather than leaving
    // the operator to infer it from a status code.
    throw new Error(
      `${SOURCE} API error (${res.status}): ${message}` +
        (res.status === 401 ? ' — the key was rejected.' : ''),
    )
  }

  return body as T
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

function readCredits(raw: Record<string, unknown>): MarkifactCredits {
  return {
    limit: num(raw.credits_limit),
    used: num(raw.credits_used),
    remaining: num(raw.credits_remaining),
    tier: str(raw.tier) || 'unknown',
    periodEnd: num(raw.billing_period_end),
  }
}

/** The list arrives as a bare array rather than wrapped in a `data` key. */
function readConnections(raw: unknown): MarkifactConnection[] {
  return asArray(raw)
    .filter(isRecord)
    .map((row) => ({
      id: str(row.id),
      type: str(row.type) || 'unknown',
      displayName: str(row.display_name) || str(row.type),
      createdAt: num(row.created_at),
    }))
    .filter((row) => row.id !== '')
    .sort((a, b) => a.type.localeCompare(b.type))
}

function readLogs(raw: unknown): MarkifactLog[] {
  return asArray(raw)
    .filter(isRecord)
    .map((row) => {
      const source = isRecord(row.source) ? row.source : {}
      return {
        id: str(row.id),
        operationId: str(row.operation_id) || 'unknown',
        status: str(row.status) || 'unknown',
        // The agent's own name where there is one — "Yesterday's Total Ad
        // Spend" says more than "agent" does.
        source: str(source.name) || str(source.type) || 'unknown',
        startedAt: num(row.started_at),
        creditsUsed: num(row.credits_used),
        cacheHit: row.cache_hit === true,
      }
    })
    .filter((row) => row.id !== '')
}

/**
 * The same operations grouped, ranked by what they cost.
 *
 * A hundred rows of log say what happened; they do not say that one operation
 * is responsible for most of the credit burn, or that another fails every
 * other run. Both only appear once the rows are added up.
 */
function rollUp(logs: MarkifactLog[]): MarkifactOperationRollup[] {
  const byOperation = new Map<string, MarkifactOperationRollup>()

  for (const log of logs) {
    const found = byOperation.get(log.operationId) ?? {
      operationId: log.operationId,
      runs: 0,
      failures: 0,
      credits: 0,
    }
    found.runs += 1
    if (log.status !== 'success') found.failures += 1
    found.credits += log.creditsUsed
    byOperation.set(log.operationId, found)
  }

  return [...byOperation.values()].sort(
    (a, b) => b.credits - a.credits || b.runs - a.runs,
  )
}
