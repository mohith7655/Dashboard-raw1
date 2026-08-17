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
import {
  fetchAllPages,
  normaliseAccountId,
  readGraphError,
} from '../lib/metaLeads'

const GRAPH_VERSION = 'v21.0'
const HINT = 'This is a session issue. Please refresh the page or click Retry.'

/**
 * Facebook Marketing Insights. Returns normalised JSON; the access token never
 * leaves this function.
 */
export default async function handler(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url)
    const range = readRange(url)
    const against = readComparison(url, range)
    const token = requireEnv('META_ACCESS_TOKEN')
    const accountId = normaliseAccountId(requireEnv('META_AD_ACCOUNT_ID'))

    const [current, previous, campaigns] = await Promise.all([
      fetchInsights(accountId, token, range),
      // With no comparison chosen there is nothing to divide by, so the second
      // window is never fetched rather than fetched and discarded.
      against ? fetchInsights(accountId, token, against) : null,
      fetchCampaigns(accountId, token, range),
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

async function fetchInsights(
  accountId: string,
  token: string,
  range: DateRange,
): Promise<AdsTotals> {
  const params = new URLSearchParams({
    fields: 'spend,impressions,clicks,actions,action_values',
    time_range: JSON.stringify({ since: range.start, until: range.end }),
    level: 'account',
    access_token: token,
  })

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${accountId}/insights?${params.toString()}`,
  )
  const body: unknown = await res.json()

  if (!res.ok) throw new Error(readGraphError(body, res.status))

  const rows = isRecord(body) ? asArray(body.data) : []
  const row = rows.find(isRecord) ?? {}

  return {
    spend: num(row.spend),
    impressions: num(row.impressions),
    clicks: num(row.clicks),
    conversions: sumActions(row.actions),
    conversionValue: sumActions(row.action_values),
  }
}

/**
 * Campaign-level insights for the period. Status is not an insights field, so
 * it comes from a second call and is merged in by id.
 */
async function fetchCampaigns(
  accountId: string,
  token: string,
  range: DateRange,
): Promise<Campaign[]> {
  const params = new URLSearchParams({
    fields: 'campaign_id,campaign_name,spend,impressions,clicks,actions,action_values',
    time_range: JSON.stringify({ since: range.start, until: range.end }),
    level: 'campaign',
    limit: '500',
    access_token: token,
  })

  const [rows, statuses] = await Promise.all([
    fetchAllPages(
      `https://graph.facebook.com/${GRAPH_VERSION}/${accountId}/insights?${params.toString()}`,
    ),
    fetchCampaignStatuses(accountId, token),
  ])

  const campaigns = rows.map((row) => {
    const id = String(row.campaign_id ?? '')
    return buildCampaign(
      {
        id,
        name: typeof row.campaign_name === 'string' ? row.campaign_name : id,
        status: statuses.get(id) ?? '',
      },
      {
        spend: num(row.spend),
        impressions: num(row.impressions),
        clicks: num(row.clicks),
        conversions: sumActions(row.actions),
        conversionValue: sumActions(row.action_values),
      },
    )
  })

  return rankCampaigns(campaigns)
}

/**
 * Status is decoration on the campaign table, so a failure here degrades to a
 * blank column rather than taking the whole Meta section down with it.
 */
async function fetchCampaignStatuses(
  accountId: string,
  token: string,
): Promise<Map<string, string>> {
  const params = new URLSearchParams({
    fields: 'id,effective_status',
    limit: '500',
    access_token: token,
  })

  try {
    const rows = await fetchAllPages(
      `https://graph.facebook.com/${GRAPH_VERSION}/${accountId}/campaigns?${params.toString()}`,
    )
    return new Map(
      rows.map((row) => [String(row.id ?? ''), readStatus(row.effective_status)]),
    )
  } catch {
    return new Map()
  }
}

/** Meta's enum → the wording the campaign table shares with Google. */
function readStatus(status: unknown): string {
  if (typeof status !== 'string') return ''
  if (status === 'ACTIVE') return 'Active'
  if (status.endsWith('PAUSED')) return 'Paused'
  if (status === 'DELETED' || status === 'ARCHIVED') return 'Ended'
  // Anything else is a review or billing state; show Meta's own word for it.
  return status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ')
}

/**
 * Meta reports one row per action type, and the purchase rows overlap:
 * `omni_purchase` already contains the pixel purchases that
 * `offsite_conversion.fb_pixel_purchase` reports on its own, and `purchase`
 * sits between them. Summing all three counts the same order up to three
 * times, so the first type present wins and the rest are ignored.
 */
const PURCHASE_ACTIONS = [
  'omni_purchase',
  'purchase',
  'offsite_conversion.fb_pixel_purchase',
]

function sumActions(raw: unknown): number {
  const rows = asArray(raw).filter(isRecord)
  for (const actionType of PURCHASE_ACTIONS) {
    const matches = rows.filter((a) => a.action_type === actionType)
    if (matches.length > 0) {
      return matches.reduce((sum, a) => sum + num(a.value), 0)
    }
  }
  return 0
}
