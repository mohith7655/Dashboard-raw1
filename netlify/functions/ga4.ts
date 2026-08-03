import type {
  DateRange,
  Ga4Dimension,
  Ga4Measures,
  Ga4Report,
  Ga4Row,
} from '../../src/lib/types'
import { GA4_DIMENSIONS } from '../../src/lib/types'
import { round2 } from '../../src/lib/derive'
import {
  BadRequest,
  asArray,
  isRecord,
  json,
  num,
  readRange,
  requireEnv,
  toErrorResponse,
} from '../lib/http'

const API = 'https://analyticsdata.googleapis.com/v1beta'
const HINT =
  'The GA4 connector could not be reached. Check GA4_PROPERTY_ID, and that the refresh token carries the analytics.readonly scope — `npm run ga4:auth` mints one that does. Then click Retry.'

/** GA4 caps a report at 250k rows; a breakdown table needs far fewer. */
const ROW_LIMIT = 250

/**
 * Google Analytics 4, read directly.
 *
 * Metorik relays only a daily visitor count, with no dimensions at all — no
 * country, landing page or source. Everything dimensional has to come from
 * GA4's own Data API, which is what this function is for.
 *
 *   ?start=&end=&dimension=country → totals plus one row per dimension value
 */
export default async function handler(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url)
    const range = readRange(url)
    const dimension = readDimension(url)
    const propertyId = requireEnv('GA4_PROPERTY_ID').replace(/\D/g, '')
    if (!propertyId) throw new BadRequest('GA4_PROPERTY_ID must be numeric')

    const token = await getAccessToken()
    const schema = await loadSchema(propertyId, token)

    return json(await runBreakdown(propertyId, token, range, dimension, schema))
  } catch (err) {
    return toErrorResponse(err, HINT)
  }
}

function readDimension(url: URL): Ga4Dimension {
  const raw = url.searchParams.get('dimension') ?? 'country'
  const match = GA4_DIMENSIONS.find((d) => d === raw)
  if (!match) {
    throw new BadRequest(`\`dimension\` must be one of ${GA4_DIMENSIONS.join(', ')}`)
  }
  return match
}

/**
 * The GA4 credentials are separate from the Ads ones because the scopes differ:
 * an Ads token carries `adwords` only and is rejected here. Client id and secret
 * can still be shared, since re-consenting the same OAuth client for both scopes
 * is the simplest setup.
 */
const ANALYTICS_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly'

async function getAccessToken(): Promise<string> {
  const usingFallback = !process.env.GA4_REFRESH_TOKEN
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GA4_CLIENT_ID || requireEnv('GOOGLE_ADS_CLIENT_ID'),
      client_secret:
        process.env.GA4_CLIENT_SECRET || requireEnv('GOOGLE_ADS_CLIENT_SECRET'),
      refresh_token:
        process.env.GA4_REFRESH_TOKEN || requireEnv('GOOGLE_ADS_REFRESH_TOKEN'),
      grant_type: 'refresh_token',
    }),
  })
  const body: unknown = await res.json()

  if (!res.ok || !isRecord(body) || typeof body.access_token !== 'string') {
    const detail =
      isRecord(body) && typeof body.error_description === 'string'
        ? body.error_description
        : `token endpoint returned ${res.status}`
    throw new Error(`GA4 API error (OAUTH): ${detail}`)
  }

  // An Ads token authenticates fine and then fails every Data API call with a
  // bare "insufficient authentication scopes". The grant lists its scopes here,
  // so the mismatch is worth naming now rather than two requests later.
  const granted = typeof body.scope === 'string' ? body.scope : ''
  if (granted && !granted.split(' ').includes(ANALYTICS_SCOPE)) {
    throw new Error(
      `GA4 API error (SCOPE): the refresh token in ${
        usingFallback ? 'GOOGLE_ADS_REFRESH_TOKEN' : 'GA4_REFRESH_TOKEN'
      } carries [${granted}] but not ${ANALYTICS_SCOPE}, so the Data API rejects it. ` +
        'Run `npm run ga4:auth` to mint one that carries both scopes.',
    )
  }
  return body.access_token
}

/* ------------------------------------------------------------------ *
 * Field resolution
 *
 * GA4 has renamed fields under the API more than once — conversions became key
 * events, landing page gained a query-string variant — and not every property
 * offers every metric. Rather than hardcode one spelling and have a single
 * rename 400 the whole report, each field is a preference list resolved against
 * the property's own metadata, and anything unmatched is simply dropped.
 * ------------------------------------------------------------------ */

const DIMENSION_CANDIDATES: Record<Ga4Dimension, string[]> = {
  country: ['country'],
  landingPage: ['landingPagePlusQueryString', 'landingPage'],
  pagePath: ['pagePath'],
  sourceMedium: ['sessionSourceMedium', 'sourceMedium', 'sessionSource'],
  channel: ['sessionDefaultChannelGroup', 'defaultChannelGroup'],
  device: ['deviceCategory'],
  browser: ['browser'],
  operatingSystem: ['operatingSystem'],
}

/** Keyed by the field name on `Ga4Measures`. */
const METRIC_CANDIDATES: Record<keyof Ga4Measures, string[]> = {
  users: ['activeUsers', 'totalUsers'],
  sessions: ['sessions'],
  pageViews: ['screenPageViews'],
  engagementRate: ['engagementRate'],
  bounceRate: ['bounceRate'],
  avgSessionDuration: ['averageSessionDuration'],
  purchases: ['ecommercePurchases', 'transactions', 'keyEvents', 'conversions'],
  revenue: ['purchaseRevenue', 'totalRevenue'],
  // Both are derived from the metrics above, never requested from GA4.
  conversionRate: [],
  revenuePerUser: [],
}

interface Schema {
  dimensions: Set<string>
  metrics: Set<string>
  currency: string
}

async function loadSchema(propertyId: string, token: string): Promise<Schema> {
  const res = await fetch(`${API}/properties/${propertyId}/metadata`, {
    headers: { authorization: `Bearer ${token}` },
  })
  const body: unknown = await res.json()
  if (!res.ok) throw new Error(readGa4Error(body, res.status))

  const names = (raw: unknown): Set<string> =>
    new Set(
      asArray(raw)
        .filter(isRecord)
        .map((row) => String(row.apiName ?? ''))
        .filter(Boolean),
    )

  const record = isRecord(body) ? body : {}
  return {
    dimensions: names(record.dimensions),
    metrics: names(record.metrics),
    // Metadata does not carry the currency; the report response does.
    currency: '',
  }
}

const resolve = (candidates: string[], available: Set<string>): string | null =>
  candidates.find((name) => available.has(name)) ?? null

/* ------------------------------------------------------------------ *
 * The report
 * ------------------------------------------------------------------ */

/** Metrics requested from GA4, in the order the response columns arrive. */
const REQUESTED: (keyof Ga4Measures)[] = [
  'users',
  'sessions',
  'pageViews',
  'engagementRate',
  'bounceRate',
  'avgSessionDuration',
  'purchases',
  'revenue',
]

async function runBreakdown(
  propertyId: string,
  token: string,
  range: DateRange,
  dimension: Ga4Dimension,
  schema: Schema,
): Promise<Ga4Report> {
  const dimensionName = resolve(DIMENSION_CANDIDATES[dimension], schema.dimensions)
  if (!dimensionName) {
    throw new Error(
      `GA4 API error (SCHEMA): this property does not report ${dimension}.`,
    )
  }

  // Only ask for what the property actually has, so one missing metric costs
  // that column rather than the entire report.
  const fields: (keyof Ga4Measures)[] = []
  const metricNames: string[] = []
  const unsupported: string[] = []

  for (const field of REQUESTED) {
    const name = resolve(METRIC_CANDIDATES[field], schema.metrics)
    if (name) {
      fields.push(field)
      metricNames.push(name)
    } else {
      unsupported.push(field)
    }
  }

  const res = await fetch(`${API}/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      dimensions: [{ name: dimensionName }],
      metrics: metricNames.map((name) => ({ name })),
      dateRanges: [{ startDate: range.start, endDate: range.end }],
      // Biggest first, matching every other table in the dashboard.
      orderBys: [{ metric: { metricName: metricNames[0] }, desc: true }],
      limit: String(ROW_LIMIT),
      metricAggregations: ['TOTAL'],
      keepEmptyRows: false,
    }),
  })
  const body: unknown = await res.json()
  if (!res.ok) throw new Error(readGa4Error(body, res.status))

  const record = isRecord(body) ? body : {}
  const rows: Ga4Row[] = asArray(record.rows)
    .filter(isRecord)
    .map((row) => ({
      key: readDimensionValue(row),
      ...measuresFrom(readMetricValues(row), fields),
    }))

  // GA4 returns the grand total as a separate single row, which is not the sum
  // of the page of rows once the limit truncates them.
  const totalRow = asArray(record.totals).filter(isRecord)[0]
  const totals = totalRow
    ? measuresFrom(readMetricValues(totalRow), fields)
    : sumRows(rows)

  // Nested under `metadata`, not at the top level of the response.
  const meta = isRecord(record.metadata) ? record.metadata : {}

  return {
    dimension,
    totals,
    rows,
    currency: String(meta.currencyCode ?? '') || 'USD',
    unsupported,
  }
}

function readDimensionValue(row: Record<string, unknown>): string {
  const first = asArray(row.dimensionValues).filter(isRecord)[0]
  const value = first ? String(first.value ?? '') : ''
  // GA4 writes unset dimensions this way; the dashboard's own wording is used
  // elsewhere for the same idea.
  if (!value || value === '(not set)') return '(unknown)'
  return value
}

function readMetricValues(row: Record<string, unknown>): number[] {
  return asArray(row.metricValues)
    .filter(isRecord)
    // Every GA4 metric arrives as a string, including the rates.
    .map((cell) => num(cell.value))
}

/** Maps the response columns back onto named fields, then derives the rest. */
function measuresFrom(values: number[], fields: (keyof Ga4Measures)[]): Ga4Measures {
  const measures: Ga4Measures = {
    users: 0,
    sessions: 0,
    pageViews: 0,
    engagementRate: 0,
    bounceRate: 0,
    avgSessionDuration: 0,
    purchases: 0,
    revenue: 0,
    conversionRate: 0,
    revenuePerUser: 0,
  }

  fields.forEach((field, i) => {
    measures[field] = values[i] ?? 0
  })

  measures.revenue = round2(measures.revenue)
  measures.avgSessionDuration = Math.round(measures.avgSessionDuration)
  measures.conversionRate =
    measures.sessions > 0 ? measures.purchases / measures.sessions : 0
  measures.revenuePerUser =
    measures.users > 0 ? round2(measures.revenue / measures.users) : 0
  return measures
}

/** Only used when GA4 omits the totals block. */
function sumRows(rows: Ga4Row[]): Ga4Measures {
  const totals = measuresFrom([], [])
  for (const row of rows) {
    totals.users += row.users
    totals.sessions += row.sessions
    totals.pageViews += row.pageViews
    totals.purchases += row.purchases
    totals.revenue += row.revenue
  }
  // Rates cannot be summed; recompute the two that are ratios of the sums and
  // leave the rest at zero rather than inventing an average of averages.
  totals.revenue = round2(totals.revenue)
  totals.conversionRate = totals.sessions > 0 ? totals.purchases / totals.sessions : 0
  totals.revenuePerUser = totals.users > 0 ? round2(totals.revenue / totals.users) : 0
  return totals
}

function readGa4Error(body: unknown, status: number): string {
  if (isRecord(body) && isRecord(body.error)) {
    const { message, status: code } = body.error
    const text = typeof message === 'string' ? message : 'request failed'
    return `GA4 API error (${typeof code === 'string' ? code : status}): ${text}`
  }
  return `GA4 API error (${status}): request failed`
}
