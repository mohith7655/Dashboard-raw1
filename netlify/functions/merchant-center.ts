import type {
  FeedAccountIssue,
  FeedDestination,
  FeedIssue,
  MerchantFeed,
} from '../../src/lib/types'
import { asArray, isRecord, json, num, requireEnv, toErrorResponse } from '../lib/http'
import { googleAccessToken, googleJson } from '../lib/google'

const API = 'https://shoppingcontent.googleapis.com/content/v2.1'
const SOURCE = 'Merchant Center'
const SCOPE = 'https://www.googleapis.com/auth/content'
const REMEDY = 'Run `npm run google:auth` to mint one that carries it.'
const HINT =
  'Merchant Center could not be reached. Check GMC_MERCHANT_ID is the numeric account id shown in Merchant Center, that the Content API for Shopping is enabled in the Google Cloud project, and that the refresh token carries the content scope. Then click Retry.'

/**
 * The health of the product feed behind the Shopping ads.
 *
 * Google Ads reports what the Shopping campaigns spent; it does not report that
 * a third of the catalogue stopped serving on Tuesday because a price mismatch
 * disapproved it. That is a Merchant Center fact, and it is the one that
 * explains a Shopping campaign whose impressions fell without anybody touching
 * the budget.
 *
 * One call: `accountstatuses` already carries the item counts per destination
 * and every item-level issue with the number of products it affects, so there
 * is no reason to walk the catalogue product by product.
 */
export default async function handler(): Promise<Response> {
  try {
    const merchantId = requireEnv('GMC_MERCHANT_ID').replace(/\D/g, '')
    if (!merchantId) throw new Error('GMC_MERCHANT_ID must be numeric')
    // Differs from the merchant id only under a multi-client account, where the
    // caller is the MCA and the account being asked about is one of its children.
    const accountId = (process.env.GMC_ACCOUNT_ID || merchantId).replace(/\D/g, '')

    const token = await googleAccessToken({
      source: SOURCE,
      scope: SCOPE,
      clientIdKeys: ['GMC_CLIENT_ID', 'GA4_CLIENT_ID', 'GOOGLE_ADS_CLIENT_ID'],
      clientSecretKeys: [
        'GMC_CLIENT_SECRET',
        'GA4_CLIENT_SECRET',
        'GOOGLE_ADS_CLIENT_SECRET',
      ],
      refreshTokenKeys: ['GMC_REFRESH_TOKEN', 'GA4_REFRESH_TOKEN'],
      remedy: REMEDY,
    })

    const status = await googleJson<Record<string, unknown>>(
      `${API}/${merchantId}/accountstatuses/${accountId}`,
      token,
      SOURCE,
    )

    return json(readFeed(status, merchantId))
  } catch (err) {
    return toErrorResponse(err, HINT)
  }
}

/**
 * Every count arrives as a string.
 *
 * The Content API renders int64 fields as JSON strings, so `active` is `"412"`
 * rather than `412`. Added together untouched they concatenate, which is how a
 * feed of four hundred items reports forty thousand.
 */
function readFeed(status: Record<string, unknown>, merchantId: string): MerchantFeed {
  const destinations: FeedDestination[] = []
  const issuesByCode = new Map<string, FeedIssue>()

  for (const entry of asArray(status.products).filter(isRecord)) {
    const stats = isRecord(entry.statistics) ? entry.statistics : {}
    destinations.push({
      destination: str(entry.destination) || str(entry.channel) || 'Unknown',
      country: str(entry.country),
      active: num(stats.active),
      pending: num(stats.pending),
      disapproved: num(stats.disapproved),
      expiring: num(stats.expiring),
    })

    // The same issue is reported once per destination and country. Summed
    // across them a product would be counted several times over, so the worst
    // single figure is kept instead: "how many products does this affect" is
    // the question, and no product is more than all of them.
    for (const raw of asArray(entry.itemLevelIssues).filter(isRecord)) {
      const code = str(raw.code) || str(raw.description) || 'unknown'
      const affected = num(raw.numItems)
      const existing = issuesByCode.get(code)
      if (existing) {
        existing.affected = Math.max(existing.affected, affected)
        continue
      }
      issuesByCode.set(code, {
        code,
        description: str(raw.description) || code,
        detail: str(raw.detail),
        documentation: str(raw.documentation),
        servability: str(raw.servability) || 'unaffected',
        affected,
      })
    }
  }

  const accountIssues: FeedAccountIssue[] = asArray(status.accountLevelIssues)
    .filter(isRecord)
    .map((raw) => ({
      title: str(raw.title) || str(raw.id),
      severity: str(raw.severity) || 'info',
      detail: str(raw.detail),
      documentation: str(raw.documentation),
    }))
    .filter((issue) => issue.title !== '')

  return {
    merchantId,
    // Absent means unclaimed as far as serving is concerned; the optimistic
    // reading of a missing field would be the wrong one here.
    websiteClaimed: status.websiteClaimed === true,
    totals: {
      active: sum(destinations, 'active'),
      pending: sum(destinations, 'pending'),
      disapproved: sum(destinations, 'disapproved'),
      expiring: sum(destinations, 'expiring'),
    },
    destinations: destinations.sort((a, b) => b.active - a.active),
    // Worst first: an issue that stops items serving outranks one that only
    // demotes them, and within each, the one affecting most products leads.
    issues: [...issuesByCode.values()].sort(
      (a, b) => severityRank(b) - severityRank(a) || b.affected - a.affected,
    ),
    accountIssues,
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

const sum = (rows: FeedDestination[], key: keyof FeedDestination): number =>
  rows.reduce((total, row) => total + (typeof row[key] === 'number' ? row[key] : 0), 0)

function severityRank(issue: FeedIssue): number {
  if (issue.servability === 'disapproved') return 2
  if (issue.servability === 'demoted') return 1
  return 0
}
