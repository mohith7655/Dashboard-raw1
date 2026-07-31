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

const GRAPH_VERSION = 'v21.0'
const HINT = 'This is a session issue. Please refresh the page or click Retry.'

/**
 * Facebook Marketing Insights. Returns normalised JSON; the access token never
 * leaves this function.
 */
export default async function handler(request: Request): Promise<Response> {
  try {
    const range = readRange(new URL(request.url))
    const token = requireEnv('META_ACCESS_TOKEN')
    const accountId = normaliseAccountId(requireEnv('META_AD_ACCOUNT_ID'))

    const [current, previous] = await Promise.all([
      fetchInsights(accountId, token, range),
      fetchInsights(accountId, token, previousRange(range)),
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

/** Meta expects `act_<id>`; accept either form in the env var. */
function normaliseAccountId(raw: string): string {
  return raw.startsWith('act_') ? raw : `act_${raw}`
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

/** Preserves Facebook's own wording, e.g. `Facebook API error (190): …`. */
function readGraphError(body: unknown, status: number): string {
  if (isRecord(body) && isRecord(body.error)) {
    const { message, code } = body.error
    const text = typeof message === 'string' ? message : 'Unknown error'
    return `Facebook API error (${num(code) || status}): ${text}`
  }
  return `Facebook API error (${status}): request failed`
}
