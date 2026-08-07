import type {
  DateRange,
  GscDimension,
  GscMeasures,
  GscReport,
  GscRow,
} from '../../src/lib/types'
import { GSC_DIMENSIONS } from '../../src/lib/types'
import { round2 } from '../../src/lib/derive'
import {
  BadRequest,
  asArray,
  isRecord,
  json,
  num,
  readComparison,
  readRange,
  requireEnv,
  toErrorResponse,
} from '../lib/http'
import { googleAccessToken, googleJson } from '../lib/google'

const API = 'https://www.googleapis.com/webmasters/v3'
const SOURCE = 'Search Console'
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly'
const REMEDY = 'Run `npm run google:auth` to mint one that carries it.'
const HINT =
  'Search Console could not be reached. Check GSC_SITE_URL matches a property you own exactly — `sc-domain:example.com` for a domain property, or the full `https://example.com/` including the trailing slash — and that the refresh token carries webmasters.readonly. Then click Retry.'

/** A breakdown table needs the head of the distribution, not all 25,000 rows. */
const ROW_LIMIT = 250

/**
 * Organic search, read from Search Console's Search Analytics API.
 *
 * The one channel the dashboard was blind to. GA4 reports the visit once
 * somebody arrives; only Search Console reports the impression that did not
 * become a visit, the query behind it, and the average rank that decided the
 * difference — which is to say, the whole of the funnel before the click.
 *
 *   ?start=&end=&dimension=query[&compareStart=&compareEnd=|&compare=none]
 */
export default async function handler(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url)
    const range = readRange(url)
    const against = readComparison(url, range)
    const dimension = readDimension(url)
    const siteUrl = requireEnv('GSC_SITE_URL').trim()

    const token = await googleAccessToken({
      source: SOURCE,
      scope: SCOPE,
      clientIdKeys: ['GSC_CLIENT_ID', 'GA4_CLIENT_ID', 'GOOGLE_ADS_CLIENT_ID'],
      clientSecretKeys: [
        'GSC_CLIENT_SECRET',
        'GA4_CLIENT_SECRET',
        'GOOGLE_ADS_CLIENT_SECRET',
      ],
      refreshTokenKeys: ['GSC_REFRESH_TOKEN', 'GA4_REFRESH_TOKEN'],
      remedy: REMEDY,
    })

    // Four cuts of the same period, in parallel: the headline totals, the
    // breakdown on screen, the daily trend, and the comparison window. The
    // comparison is skipped entirely when it is switched off rather than
    // fetched and discarded.
    const [totals, rows, series, previousTotals] = await Promise.all([
      queryTotals(siteUrl, token, range),
      queryRows(siteUrl, token, range, dimension),
      querySeries(siteUrl, token, range),
      against ? queryTotals(siteUrl, token, against) : Promise.resolve(null),
    ])

    const report: GscReport = {
      siteUrl,
      dimension,
      totals,
      previousTotals,
      rows,
      series,
      // Read off the daily cut rather than assumed from the range: the lag is
      // two to three days but it is not a constant, and guessing at it would
      // put the caveat on the wrong day.
      freshestDate: series.length ? series[series.length - 1].date : null,
    }
    return json(report)
  } catch (err) {
    return toErrorResponse(err, HINT)
  }
}

function readDimension(url: URL): GscDimension {
  const raw = url.searchParams.get('dimension') ?? 'query'
  const match = GSC_DIMENSIONS.find((d) => d === raw)
  if (!match) {
    throw new BadRequest(`\`dimension\` must be one of ${GSC_DIMENSIONS.join(', ')}`)
  }
  return match
}

interface QueryBody {
  startDate: string
  endDate: string
  dimensions?: string[]
  rowLimit?: number
  dataState?: string
}

interface ApiRow {
  keys?: unknown
  clicks?: unknown
  impressions?: unknown
  ctr?: unknown
  position?: unknown
}

async function search(
  siteUrl: string,
  token: string,
  body: QueryBody,
): Promise<ApiRow[]> {
  // The property is a path segment and routinely contains `:` and `/` —
  // `sc-domain:example.com`, `https://example.com/` — so it has to be encoded
  // whole rather than interpolated.
  const endpoint = `${API}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`
  const payload = await googleJson<{ rows?: unknown }>(endpoint, token, SOURCE, {
    method: 'POST',
    // `all` includes the days Search Console has not finalised. Without it the
    // most recent days are simply absent, which reads as a traffic collapse;
    // with it they are present and `freshestDate` says how fresh they are.
    body: JSON.stringify({ dataState: 'all', ...body }),
  })
  return asArray(payload.rows).filter(isRecord)
}

const measuresOf = (row: ApiRow): GscMeasures => ({
  clicks: num(row.clicks),
  impressions: num(row.impressions),
  // Rates arrive as fractions and stay that way; rounding to two decimals here
  // would collapse a 0.4% CTR to zero.
  ctr: num(row.ctr),
  position: round2(num(row.position)),
})

const EMPTY: GscMeasures = { clicks: 0, impressions: 0, ctr: 0, position: 0 }

/** The period as one row. An empty property returns no rows at all, not zeroes. */
async function queryTotals(
  siteUrl: string,
  token: string,
  range: DateRange,
): Promise<GscMeasures> {
  const rows = await search(siteUrl, token, {
    startDate: range.start,
    endDate: range.end,
  })
  return rows.length ? measuresOf(rows[0]) : { ...EMPTY }
}

async function queryRows(
  siteUrl: string,
  token: string,
  range: DateRange,
  dimension: GscDimension,
): Promise<GscRow[]> {
  const rows = await search(siteUrl, token, {
    startDate: range.start,
    endDate: range.end,
    dimensions: [dimension],
    rowLimit: ROW_LIMIT,
  })

  return rows.map((row) => {
    const keys = asArray(row.keys)
    return {
      key: typeof keys[0] === 'string' && keys[0] ? keys[0] : '(not set)',
      ...measuresOf(row),
    }
  })
}

async function querySeries(
  siteUrl: string,
  token: string,
  range: DateRange,
): Promise<{ date: string; clicks: number; impressions: number }[]> {
  const rows = await search(siteUrl, token, {
    startDate: range.start,
    endDate: range.end,
    dimensions: ['date'],
    // A day per row; a year of daily points is still well inside the cap.
    rowLimit: 500,
  })

  return rows
    .map((row) => {
      const keys = asArray(row.keys)
      return {
        date: typeof keys[0] === 'string' ? keys[0] : '',
        clicks: num(row.clicks),
        impressions: num(row.impressions),
      }
    })
    .filter((point) => point.date !== '')
    .sort((a, b) => a.date.localeCompare(b.date))
}
