/**
 * Leads as Meta reports them.
 *
 * Kept apart from both callers because two of them need it — the Meta ads
 * connector, for the account and campaign figures, and the leads connector,
 * for the Facebook source — and a lead count that could be derived two ways
 * would eventually be derived two different ways.
 */
import { asArray, isRecord, num } from './http'

const GRAPH_VERSION = 'v21.0'

/**
 * Which action row is the lead count, in the order it is trusted.
 *
 * Meta returns one row per action type and they overlap, so these are tried in
 * turn and the first present wins rather than being added up. `lead` is Meta's
 * own aggregate and is exactly the sum of the two below it — on this account,
 * over ninety days, `lead` 949 = `onsite_conversion.lead_grouped` 616 (the
 * lead-ads forms) + `offsite_conversion.fb_pixel_lead` 333 (the pixel). Adding
 * all three would report 1,898 leads for 949 people.
 *
 * `onsite_web_lead` is deliberately absent. It is a near-duplicate of the pixel
 * row that tracks one attribution window differently, and where both appear it
 * would double-count.
 */
const LEAD_ACTIONS = [
  'lead',
  'onsite_conversion.lead_grouped',
  'offsite_conversion.fb_pixel_lead',
]

/**
 * The trap this function exists to avoid: matching action types on the word
 * "lead".
 *
 * This account carries a custom conversion named `add_meta_leads`, which Meta
 * reports under names like `offsite_content_view_add_meta_leads` — 7,272 of
 * them in ninety days against 949 actual leads. They are content views that
 * happen to be named after the campaign that drove them, and a regex looking
 * for "lead" would report eight times the real figure. Only the exact action
 * types above are counted.
 */
export function leadsFromActions(raw: unknown): number {
  const rows = asArray(raw).filter(isRecord)
  for (const actionType of LEAD_ACTIONS) {
    const matches = rows.filter((a) => a.action_type === actionType)
    if (matches.length > 0) {
      return matches.reduce((sum, a) => sum + num(a.value), 0)
    }
  }
  return 0
}

/** Meta expects `act_<id>`; accept either form in the env var. */
export function normaliseAccountId(raw: string): string {
  return raw.startsWith('act_') ? raw : `act_${raw}`
}

/** Preserves Facebook's own wording, e.g. `Facebook API error (190): …`. */
export function readGraphError(body: unknown, status: number): string {
  if (isRecord(body) && isRecord(body.error)) {
    const { message, code } = body.error
    const text = typeof message === 'string' ? message : 'Unknown error'
    return `Facebook API error (${num(code) || status}): ${text}`
  }
  return `Facebook API error (${status}): request failed`
}

/** Meta pages with a cursor; a day-by-day breakdown runs to many pages. */
export async function fetchAllPages(
  first: string,
  maxPages = 20,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  let url: string | undefined = first

  // Bounded so a malformed cursor can never spin the function until timeout.
  for (let page = 0; url && page < maxPages; page++) {
    const res = await fetch(url)
    const body: unknown = await res.json()
    if (!res.ok) throw new Error(readGraphError(body, res.status))
    if (!isRecord(body)) break

    rows.push(...asArray(body.data).filter(isRecord))
    const paging = isRecord(body.paging) ? body.paging : null
    url = paging && typeof paging.next === 'string' ? paging.next : undefined
  }

  return rows
}

/** Leads on one day, from one campaign. */
export interface MetaLeadDay {
  /** `yyyy-MM-dd`, as Meta's own `date_start` gives it. */
  day: string
  campaign: string
  count: number
}

/**
 * Daily lead counts per campaign, over one window.
 *
 * Broken down by day rather than totalled because the leads report needs a
 * series and a comparison window out of the same call — asking Meta once for
 * the widest span anything needs, and slicing it here, keeps this to a single
 * round trip however many periods are on screen.
 */
export async function fetchMetaLeadDays(
  accountId: string,
  token: string,
  span: { start: string; end: string },
): Promise<MetaLeadDay[]> {
  const params = new URLSearchParams({
    fields: 'campaign_name,actions',
    time_range: JSON.stringify({ since: span.start, until: span.end }),
    time_increment: '1',
    level: 'campaign',
    limit: '500',
    access_token: token,
  })

  const rows = await fetchAllPages(
    `https://graph.facebook.com/${GRAPH_VERSION}/${accountId}/insights?${params}`,
    // A year of daily rows across a busy account outruns the default bound.
    40,
  )

  const days: MetaLeadDay[] = []
  for (const row of rows) {
    const count = leadsFromActions(row.actions)
    if (count <= 0) continue
    const day = typeof row.date_start === 'string' ? row.date_start : ''
    if (!day) continue
    days.push({
      day,
      campaign:
        typeof row.campaign_name === 'string' && row.campaign_name
          ? row.campaign_name
          : 'Unnamed campaign',
      count,
    })
  }
  return days
}
