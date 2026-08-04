import type { AdsMetrics, Campaign, DateRange } from '../../src/lib/types'
import {
  buildAdsMetrics,
  buildCampaign,
  deriveAds,
  emptyAdsTotals,
  rankCampaigns,
  type AdsTotals,
} from '../../src/lib/derive'
import {
  asArray,
  isRecord,
  json,
  num,
  readComparison,
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
    const url = new URL(request.url)
    const range = readRange(url)
    const against = readComparison(url, range)
    const customerId = digitsOnly(requireEnv('GOOGLE_ADS_CUSTOMER_ID'))
    const developerToken = requireEnv('GOOGLE_ADS_DEVELOPER_TOKEN')
    const accessToken = await getAccessToken()

    const search = (query: string) =>
      runSearch(customerId, developerToken, accessToken, query)

    const [current, previous, campaigns] = await Promise.all([
      fetchTotals(search, range),
      // With no comparison chosen there is nothing to divide by, so the second
      // window is never fetched rather than fetched and discarded.
      against ? fetchTotals(search, against) : null,
      fetchCampaigns(search, range),
    ])

    const metrics: AdsMetrics = buildAdsMetrics(
      deriveAds(current),
      previous && deriveAds(previous),
      campaigns,
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

type Search = (query: string) => Promise<unknown[]>

/** Runs one GAQL query and returns its rows, following pagination to the end. */
async function runSearch(
  customerId: string,
  developerToken: string,
  accessToken: string,
  query: string,
): Promise<unknown[]> {
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

  const rows: unknown[] = []
  let pageToken: string | undefined

  do {
    const payload = pageToken ? { query, pageToken } : { query }
    const res = await fetch(
      `https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}/googleAds:search`,
      { method: 'POST', headers, body: JSON.stringify(payload) },
    )
    const body: unknown = await res.json()

    if (!res.ok) throw new Error(readAdsError(body, res.status))

    rows.push(...(isRecord(body) ? asArray(body.results) : []))
    pageToken =
      isRecord(body) && typeof body.nextPageToken === 'string'
        ? body.nextPageToken
        : undefined
  } while (pageToken)

  return rows
}

/** Google reports cost in micros. */
const fromMicros = (v: unknown): number => num(v) / 1_000_000

function addMetrics(totals: AdsTotals, metrics: Record<string, unknown>): void {
  totals.spend += fromMicros(metrics.costMicros)
  totals.impressions += num(metrics.impressions)
  totals.clicks += num(metrics.clicks)
  totals.conversions += num(metrics.conversions)
  totals.conversionValue += num(metrics.conversionsValue)
}

const METRIC_FIELDS = `
  metrics.cost_micros,
  metrics.impressions,
  metrics.clicks,
  metrics.conversions,
  metrics.conversions_value
`

async function fetchTotals(search: Search, range: DateRange): Promise<AdsTotals> {
  const rows = await search(`
    SELECT ${METRIC_FIELDS}
    FROM customer
    WHERE segments.date BETWEEN '${range.start}' AND '${range.end}'
  `)

  const totals = emptyAdsTotals()
  for (const row of rows) {
    if (!isRecord(row) || !isRecord(row.metrics)) continue
    addMetrics(totals, row.metrics)
  }

  totals.spend = Math.round(totals.spend * 100) / 100
  return totals
}

async function fetchCampaigns(
  search: Search,
  range: DateRange,
): Promise<Campaign[]> {
  const rows = await search(`
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      ${METRIC_FIELDS}
    FROM campaign
    WHERE segments.date BETWEEN '${range.start}' AND '${range.end}'
  `)

  // Whether Google returns one row per campaign or one per campaign-day
  // depends on how it reads the date filter, so fold rows onto the campaign id
  // rather than trusting one row to be the whole period.
  const byId = new Map<string, { name: string; status: string; totals: AdsTotals }>()

  for (const row of rows) {
    if (!isRecord(row) || !isRecord(row.campaign)) continue
    const { id, name, status } = row.campaign
    if (id === undefined || id === null) continue

    const key = String(id)
    let entry = byId.get(key)
    if (!entry) {
      entry = {
        name: typeof name === 'string' ? name : key,
        status: readStatus(status),
        totals: emptyAdsTotals(),
      }
      byId.set(key, entry)
    }
    if (isRecord(row.metrics)) addMetrics(entry.totals, row.metrics)
  }

  const campaigns = [...byId].map(([id, { name, status, totals }]) =>
    buildCampaign({ id, name, status }, totals),
  )
  return rankCampaigns(campaigns)
}

/** `ENABLED` / `PAUSED` / `REMOVED` → the wording the table shares with Meta. */
function readStatus(status: unknown): string {
  if (status === 'ENABLED') return 'Active'
  if (status === 'PAUSED') return 'Paused'
  if (status === 'REMOVED') return 'Ended'
  return ''
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
