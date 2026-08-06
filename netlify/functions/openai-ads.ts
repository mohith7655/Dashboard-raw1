import type { AdsMetrics, Campaign, DateRange } from '../../src/lib/types'
import {
  buildAdsMetrics,
  buildCampaign,
  deriveAds,
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

const API_BASE = 'https://api.ads.openai.com/v1'
const HINT =
  'Check OPENAI_ADS_API_KEY in your Netlify environment — an Ads key is scoped to one ad account and is not the same key the Insights tab uses. Then click Retry.'

/**
 * OpenAI Ads, reported like every other platform.
 *
 * One thing it does not report: conversions. The Insights API offers
 * impressions, clicks, spend, ctr, cpc and cpm and nothing attributed at all —
 * no conversions, no conversion value, no ROAS. That is carried through as
 * `reportsConversions: false` rather than as zeroes, because a zero here would
 * read as "spent and sold nothing" and would drag the combined ROAS of the
 * platforms that do report down with it.
 */
export default async function handler(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url)
    const range = readRange(url)
    const against = readComparison(url, range)
    const apiKey = requireEnv('OPENAI_ADS_API_KEY')

    const [current, previous, campaigns] = await Promise.all([
      fetchInsights(apiKey, range, 'ad_account'),
      // With no comparison chosen there is nothing to divide by, so the second
      // window is never fetched rather than fetched and discarded.
      against ? fetchInsights(apiKey, against, 'ad_account') : null,
      fetchCampaigns(apiKey, range),
    ])

    const metrics: AdsMetrics = {
      ...buildAdsMetrics(
        deriveAds(totalsOf(current)),
        previous && deriveAds(totalsOf(previous)),
        campaigns,
      ),
      reportsConversions: false,
    }
    return json(metrics)
  } catch (err) {
    return toErrorResponse(err, HINT)
  }
}

/** The metrics the Insights API actually offers. There are no others. */
const METRIC_FIELDS = ['impressions', 'clicks', 'spend'] as const

interface InsightRow {
  id: string
  name: string
  status: string
  impressions: number
  clicks: number
  spend: number
}

/**
 * `until` is inclusive and normalises to the following local midnight, so the
 * range is passed through as the picker gives it.
 *
 * The timezone is named rather than left to the account's own, so a figure
 * lines up with the rest of the dashboard instead of shifting by a day
 * depending on how the ad account happens to be configured.
 */
const timeRange = (range: DateRange): string =>
  JSON.stringify({
    type: 'date_range',
    since: range.start,
    until: range.end,
    timezone: 'UTC',
  })

async function insights(
  apiKey: string,
  range: DateRange,
  level: 'ad_account' | 'campaign',
  extraFields: string[] = [],
): Promise<InsightRow[]> {
  const params = new URLSearchParams()
  // `none` collapses the whole window into one row per entity rather than one
  // per day, which is what a period total is.
  params.set('time_granularity', 'none')
  params.set('aggregation_level', level)
  params.append('time_ranges[]', timeRange(range))
  for (const field of [...METRIC_FIELDS, ...extraFields]) {
    params.append('fields[]', field)
  }
  params.set('limit', '500')

  const res = await fetch(`${API_BASE}/ad_account/insights?${params.toString()}`, {
    headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
  })
  const body: unknown = await res.json().catch(() => null)

  if (!res.ok) throw new Error(readApiError(body, res.status))

  const rows = isRecord(body) ? asArray(body.data) : []
  return rows.filter(isRecord).map((row) => ({
    id: String(row['campaign.id'] ?? row.campaign_id ?? row.id ?? ''),
    name: String(row['campaign.name'] ?? row.campaign_name ?? ''),
    status: readStatus(row['campaign.status'] ?? row.campaign_status),
    impressions: num(row.impressions),
    clicks: num(row.clicks),
    spend: num(row.spend),
  }))
}

const fetchInsights = (
  apiKey: string,
  range: DateRange,
  level: 'ad_account' | 'campaign',
): Promise<InsightRow[]> => insights(apiKey, range, level)

/**
 * Every counter the account reported, summed.
 *
 * Conversions and conversion value stay at zero because the API has no such
 * field. `reportsConversions` on the payload is what tells the rest of the
 * dashboard that these are absent rather than genuinely nil.
 */
function totalsOf(rows: InsightRow[]): AdsTotals {
  return rows.reduce<AdsTotals>(
    (sum, row) => ({
      spend: sum.spend + row.spend,
      impressions: sum.impressions + row.impressions,
      clicks: sum.clicks + row.clicks,
      conversions: 0,
      conversionValue: 0,
    }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0 },
  )
}

async function fetchCampaigns(apiKey: string, range: DateRange): Promise<Campaign[]> {
  const rows = await insights(apiKey, range, 'campaign', [
    'campaign.id',
    'campaign.name',
    'campaign.status',
  ])

  return rankCampaigns(
    rows.map((row) =>
      buildCampaign(
        { id: row.id, name: row.name || row.id, status: row.status },
        {
          spend: row.spend,
          impressions: row.impressions,
          clicks: row.clicks,
          conversions: 0,
          conversionValue: 0,
        },
      ),
    ),
  )
}

/** Normalised to the words the campaign table already prints. */
function readStatus(raw: unknown): string {
  const value = String(raw ?? '').toLowerCase()
  if (!value) return ''
  if (value === 'active' || value === 'enabled' || value === 'running') return 'Active'
  if (value === 'paused') return 'Paused'
  if (value === 'ended' || value === 'completed' || value === 'archived') return 'Ended'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/** The upstream message where there is one, so a bad key says so plainly. */
function readApiError(body: unknown, status: number): string {
  if (isRecord(body)) {
    const error = isRecord(body.error) ? body.error : body
    const message = error.message ?? error.detail
    if (typeof message === 'string' && message) {
      return `OpenAI Ads API error (${status}): ${message}`
    }
  }
  return `OpenAI Ads API error (${status})`
}
