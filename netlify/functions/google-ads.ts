import type { AdsMetrics, DateRange } from '../../src/lib/types'
import { buildAdsMetrics, deriveAds, type AdsTotals } from '../../src/lib/derive'
import { previousRange } from '../../src/lib/dateRange'
import {
  asArray,
  isRecord,
  json,
  num,
  readRange,
  requireEnv,
  toErrorResponse,
} from '../lib/http'

/**
 * Google sunsets each major version roughly a year after release, and a request
 * to a sunset version fails outright rather than degrading. v25 shipped
 * 2026-07-22; bump this before its sunset a year later.
 */
const API_VERSION = 'v25'
const HINT =
  'The Google Ads connector could not be reached. Check the OAuth refresh token in your Netlify environment, then click Retry.'

/** Google Ads API. All OAuth material stays server-side. */
export default async function handler(request: Request): Promise<Response> {
  try {
    const range = readRange(new URL(request.url))
    const customerId = digitsOnly(requireEnv('GOOGLE_ADS_CUSTOMER_ID'))
    const developerToken = requireEnv('GOOGLE_ADS_DEVELOPER_TOKEN')
    const accessToken = await getAccessToken()

    const [current, previous] = await Promise.all([
      fetchTotals(customerId, developerToken, accessToken, range),
      fetchTotals(customerId, developerToken, accessToken, previousRange(range)),
    ])

    const metrics: AdsMetrics = buildAdsMetrics(
      deriveAds(current),
      deriveAds(previous),
    )
    return json(metrics)
  } catch (err) {
    return toErrorResponse(err, HINT)
  }
}

/** Exchanges the long-lived refresh token for a short-lived access token. */
async function getAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: requireEnv('GOOGLE_ADS_CLIENT_ID'),
      client_secret: requireEnv('GOOGLE_ADS_CLIENT_SECRET'),
      refresh_token: requireEnv('GOOGLE_ADS_REFRESH_TOKEN'),
      grant_type: 'refresh_token',
    }),
  })
  const body: unknown = await res.json()

  if (!res.ok || !isRecord(body) || typeof body.access_token !== 'string') {
    const detail =
      isRecord(body) && typeof body.error_description === 'string'
        ? body.error_description
        : `token endpoint returned ${res.status}`
    throw new Error(`Google Ads API error (OAUTH): ${detail}`)
  }
  return body.access_token
}

async function fetchTotals(
  customerId: string,
  developerToken: string,
  accessToken: string,
  range: DateRange,
): Promise<AdsTotals> {
  const query = `
    SELECT
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value
    FROM customer
    WHERE segments.date BETWEEN '${range.start}' AND '${range.end}'
  `

  const headers: Record<string, string> = {
    authorization: `Bearer ${accessToken}`,
    'developer-token': developerToken,
    'content-type': 'application/json',
  }

  // When the OAuth user reaches the account through a manager (MCC), Google
  // requires the manager id alongside the target customer id. Without it the
  // call fails with USER_PERMISSION_DENIED even though the token is valid.
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID
  if (loginCustomerId) headers['login-customer-id'] = digitsOnly(loginCustomerId)

  const res = await fetch(
    `https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}/googleAds:search`,
    { method: 'POST', headers, body: JSON.stringify({ query }) },
  )
  const body: unknown = await res.json()

  if (!res.ok) throw new Error(readAdsError(body, res.status))

  const rows = isRecord(body) ? asArray(body.results) : []
  const totals: AdsTotals = {
    spend: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    conversionValue: 0,
  }

  for (const row of rows) {
    if (!isRecord(row) || !isRecord(row.metrics)) continue
    const m = row.metrics
    // Google reports cost in micros.
    totals.spend += num(m.costMicros) / 1_000_000
    totals.impressions += num(m.impressions)
    totals.clicks += num(m.clicks)
    totals.conversions += num(m.conversions)
    totals.conversionValue += num(m.conversionsValue)
  }

  totals.spend = Math.round(totals.spend * 100) / 100
  return totals
}

/** Google accepts ids with or without dashes; the URL path needs them stripped. */
function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '')
}

/**
 * The top-level `message` is generic ("Request contains an invalid argument").
 * The actionable text lives in the nested GoogleAdsFailure, so prefer it and
 * carry the specific error code — that is what tells an operator whether to fix
 * the token, the customer id, or the query.
 */
function readAdsError(body: unknown, status: number): string {
  if (!isRecord(body) || !isRecord(body.error)) {
    return `Google Ads API error (${status}): request failed`
  }
  const { message, status: code } = body.error
  const label = typeof code === 'string' ? code : String(status)
  const detail = readFailureDetail(body.error.details)
  const text =
    detail ?? (typeof message === 'string' ? message : 'request failed')
  return `Google Ads API error (${label}): ${text}`
}

function readFailureDetail(details: unknown): string | null {
  for (const detail of asArray(details)) {
    if (!isRecord(detail)) continue
    for (const failure of asArray(detail.errors)) {
      if (!isRecord(failure)) continue
      if (typeof failure.message !== 'string') continue
      const reason = readErrorCode(failure.errorCode)
      return reason ? `${failure.message} (${reason})` : failure.message
    }
  }
  return null
}

/** `errorCode` is a one-key union, e.g. `{ authenticationError: 'BAD_TOKEN' }`. */
function readErrorCode(errorCode: unknown): string | null {
  if (!isRecord(errorCode)) return null
  for (const value of Object.values(errorCode)) {
    if (typeof value === 'string') return value
  }
  return null
}
