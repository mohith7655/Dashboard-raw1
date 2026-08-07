/**
 * One refresh-token exchange, shared by the Google connectors that came after
 * GA4.
 *
 * Each connector names its own credential variables and falls back through the
 * ones already configured, because the realistic setup is a single OAuth client
 * consented once for every scope the dashboard needs — see `npm run google:auth`.
 * Naming them per connector anyway leaves room for a token that is deliberately
 * narrower.
 *
 * The granted scopes are checked here rather than left to the first API call.
 * Google answers a scope mismatch with a bare "Request had insufficient
 * authentication scopes", which says nothing about which token was wrong or
 * which scope was missing; the grant lists what it carries, so the mismatch is
 * worth naming now instead of two requests later.
 */
import { MissingConfig, isRecord } from './http'

export interface GoogleAuthConfig {
  /** Label for the error messages, e.g. `Search Console`. */
  source: string
  /** The scope the API demands; absent from the grant, the call is refused here. */
  scope: string
  /**
   * Variable names tried in order for each credential. The first one set wins,
   * so a connector-specific token overrides the shared one.
   */
  clientIdKeys: string[]
  clientSecretKeys: string[]
  refreshTokenKeys: string[]
  /** Appended to a scope error: how to mint a token that would work. */
  remedy: string
}

/** The first of `keys` with a value, and which one it was. */
function firstSet(keys: string[]): { key: string; value: string } | null {
  for (const key of keys) {
    const value = process.env[key]
    if (value) return { key, value }
  }
  return null
}

function requireKey(keys: string[], source: string): { key: string; value: string } {
  const found = firstSet(keys)
  if (!found) {
    throw new MissingConfig(
      `${source} needs one of ${keys.join(', ')}. Add it in Netlify under ` +
        'Project configuration → Environment variables (scoped to Functions) and redeploy.',
    )
  }
  return found
}

export async function googleAccessToken(config: GoogleAuthConfig): Promise<string> {
  const clientId = requireKey(config.clientIdKeys, config.source)
  const clientSecret = requireKey(config.clientSecretKeys, config.source)
  const refreshToken = requireKey(config.refreshTokenKeys, config.source)

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId.value,
      client_secret: clientSecret.value,
      refresh_token: refreshToken.value,
      grant_type: 'refresh_token',
    }),
  })
  const body: unknown = await res.json()

  if (!res.ok || !isRecord(body) || typeof body.access_token !== 'string') {
    const detail =
      isRecord(body) && typeof body.error_description === 'string'
        ? body.error_description
        : `token endpoint returned ${res.status}`
    throw new Error(`${config.source} API error (OAUTH): ${detail}`)
  }

  // Only checked when Google says what it granted. An empty `scope` is not
  // evidence of a narrow token, and refusing on it would block a working setup.
  const granted = typeof body.scope === 'string' ? body.scope : ''
  if (granted && !granted.split(' ').includes(config.scope)) {
    throw new Error(
      `${config.source} API error (SCOPE): the refresh token in ${refreshToken.key} carries ` +
        `[${granted}] but not ${config.scope}, so the API rejects it. ${config.remedy}`,
    )
  }

  return body.access_token
}

/**
 * A Google API response, with its error message preserved.
 *
 * Google nests the useful text two levels down and returns HTML on some
 * failures; both are flattened to one line an operator can act on rather than a
 * status code on its own.
 */
export async function googleJson<T>(
  url: string,
  token: string,
  source: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  })

  const text = await res.text()
  let body: unknown = null
  try {
    body = JSON.parse(text) as unknown
  } catch {
    if (!res.ok) {
      throw new Error(`${source} API error (${res.status}): ${text.slice(0, 200)}`)
    }
    throw new Error(`${source} API error (PARSE): the response was not JSON.`)
  }

  if (!res.ok) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : {}
    const message =
      typeof error.message === 'string' ? error.message : `request failed (${res.status})`
    const reason = typeof error.status === 'string' ? error.status : String(res.status)
    throw new Error(`${source} API error (${reason}): ${message}`)
  }

  return body as T
}
