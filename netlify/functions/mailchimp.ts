/**
 * Email engagement, read from the Mailchimp Marketing API.
 *
 * The dashboard already counts Mailchimp signups and the orders they went on
 * to place — but from the Google Sheet the Make.com automations write into,
 * not from Mailchimp. That sheet answers how many joined and what they bought;
 * it cannot say whether anybody opened the email that asked them to.
 *
 * Revenue is deliberately not read from here. Mailchimp reports
 * `ecommerce.total_revenue` as zero on every campaign this account has sent:
 * the one connected store is a WooCommerce shop that the campaigns' audiences
 * do not belong to, so the attribution never fires. A revenue card fed from
 * this endpoint would show a permanent nought and read as a collapse rather
 * than as an absent integration. The sheet already carries that figure.
 *
 *   ?start=&end=[&compareStart=&compareEnd=|&compare=none]
 */
import type {
  DateRange,
  MailchimpAudience,
  MailchimpAutomation,
  MailchimpBenchmark,
  MailchimpCampaign,
  MailchimpJourney,
  MailchimpReport,
  MailchimpTotals,
} from '../../src/lib/types'
import { metric, deltaPct } from '../../src/lib/derive'
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

const SOURCE = 'Mailchimp'
const HINT =
  'Mailchimp could not be reached. Check MAILCHIMP_API_KEY is a current key — Mailchimp → Account & billing → Extras → API keys — and that MAILCHIMP_SERVER_PREFIX matches the suffix on that key, e.g. `us11` for a key ending `-us11`. Then click Retry.'

/**
 * The cap Mailchimp allows in one page. This account has ~1,900 reports across
 * all time but under a hundred in any window the dashboard asks about, so one
 * page is the whole answer and there is no pagination to write.
 */
const PAGE = 1000

/** Only the fields the report actually renders; the full objects are fat. */
const REPORT_FIELDS = [
  'total_items',
  'reports.id',
  'reports.campaign_title',
  'reports.subject_line',
  'reports.list_name',
  'reports.send_time',
  'reports.emails_sent',
  'reports.unsubscribed',
  'reports.bounces.hard_bounces',
  'reports.bounces.soft_bounces',
  'reports.opens.unique_opens',
  'reports.opens.open_rate',
  'reports.opens.proxy_excluded_unique_opens',
  'reports.clicks.unique_subscriber_clicks',
  'reports.clicks.click_rate',
  'reports.industry_stats.open_rate',
  'reports.industry_stats.click_rate',
  'reports.industry_stats.unsub_rate',
  'reports.industry_stats.bounce_rate',
].join(',')

const AUTOMATION_FIELDS = [
  'automations.id',
  'automations.status',
  'automations.start_time',
  'automations.emails_sent',
  'automations.settings.title',
  'automations.report_summary.open_rate',
  'automations.report_summary.click_rate',
].join(',')

const LIST_FIELDS = [
  'lists.id',
  'lists.name',
  'lists.stats.member_count',
  'lists.stats.unsubscribe_count',
  'lists.stats.cleaned_count',
  'lists.stats.open_rate',
  'lists.stats.click_rate',
  'lists.stats.avg_sub_rate',
  'lists.stats.avg_unsub_rate',
  'lists.stats.campaign_last_sent',
].join(',')

export default async function handler(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url)
    const range = readRange(url)
    const against = readComparison(url, range)
    const key = requireEnv('MAILCHIMP_API_KEY').trim()
    const prefix = serverPrefix(key)

    /*
     * Six calls, in parallel and no more than six: Mailchimp allows ten
     * simultaneous connections per account, and a fan-out over campaigns would
     * blow through that on a busy month. Everything on screen is derived from
     * these instead.
     *
     * The comparison window is skipped entirely when it is switched off, and
     * the all-time probe asks for a single row — it exists only to date the
     * most recent send, which is what tells an empty period apart from a
     * broken connector.
     *
     * The last two are the whole of the Automations screen, and neither is in
     * `/reports`: asking it for `type=automation` returns nothing. Mailchimp
     * splits that screen across two endpoints and two tabs — Classic
     * Automations under `/automations`, Automation flows under
     * `/customer-journeys/journeys` — so reading one of them shows the reader
     * half the automations they have and no sign that the other half exists.
     */
    const [current, previous, lists, latest, automations, journeys] =
      await Promise.all([
        fetchReports(prefix, key, range),
        against ? fetchReports(prefix, key, against) : Promise.resolve([]),
        fetchLists(prefix, key),
        fetchLatestSend(prefix, key),
        fetchAutomations(prefix, key),
        fetchJourneys(prefix, key),
      ])

    const campaigns = current.map(toCampaign).sort((a, b) => b.sentAt.localeCompare(a.sentAt))

    const report: MailchimpReport = {
      totals: totalsOf(campaigns, against ? previous.map(toCampaign) : null),
      campaigns,
      audiences: toAudiences(lists),
      automations,
      journeys,
      // From the newest send in the window, falling back to the newest on the
      // account. Without the fallback a month with no campaigns in it would
      // have nothing to set its automations against — which is the month the
      // comparison is most wanted, since it is the one where the automations
      // are the whole of the activity.
      benchmark: benchmarkOf(current) ?? latest.benchmark,
      lastSendAt: latest.sendTime,
      proxyExcludedOpenRate: proxyRateOf(campaigns),
    }
    return json(report)
  } catch (err) {
    return toErrorResponse(err, HINT)
  }
}

/**
 * The data centre the account lives in.
 *
 * Taken from the explicit variable where it is set, and otherwise from the
 * suffix every Mailchimp key carries — `…-us11` is served by `us11`. Falling
 * back rather than requiring both means a working key alone is enough to bring
 * the tab up.
 */
function serverPrefix(key: string): string {
  const configured = process.env.MAILCHIMP_SERVER_PREFIX?.trim()
  if (configured) return configured

  const suffix = key.slice(key.lastIndexOf('-') + 1)
  if (!suffix || suffix === key) {
    throw new Error(
      'MAILCHIMP_SERVER_PREFIX is not set and the API key carries no `-us00` suffix to read it from.',
    )
  }
  return suffix
}

async function call<T>(
  prefix: string,
  key: string,
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const query = new URLSearchParams(params).toString()
  const res = await fetch(`https://${prefix}.api.mailchimp.com/3.0${path}?${query}`, {
    headers: { authorization: `Bearer ${key}` },
  })

  const text = await res.text()
  if (!res.ok) {
    // Mailchimp answers errors as RFC 7807 problem documents. The `detail` is
    // the sentence worth surfacing — "API Key Invalid", "Your API key may be
    // invalid, or you've attempted to access the wrong datacenter" — so it is
    // passed through rather than replaced with the status code.
    let detail = text.slice(0, 300)
    try {
      const body: unknown = JSON.parse(text)
      if (isRecord(body) && typeof body.detail === 'string') detail = body.detail
    } catch {
      /* Not JSON; the raw text above is the best available message. */
    }
    throw new Error(`${SOURCE} responded ${res.status}: ${detail}`)
  }

  return JSON.parse(text) as T
}

/**
 * The sends inside a window.
 *
 * Mailchimp filters on `send_time`, which it reports with an offset, so the
 * window is bounded at UTC midnight either end. The dashboard's ranges are
 * plain `yyyy-MM-dd` days and every other source reads them the same way.
 */
async function fetchReports(
  prefix: string,
  key: string,
  range: DateRange,
): Promise<Record<string, unknown>[]> {
  const payload = await call<{ reports?: unknown }>(prefix, key, '/reports', {
    count: String(PAGE),
    since_send_time: `${range.start}T00:00:00+00:00`,
    before_send_time: `${range.end}T23:59:59+00:00`,
    sort_field: 'send_time',
    sort_dir: 'DESC',
    fields: REPORT_FIELDS,
  })
  return asArray(payload.reports).filter(isRecord)
}

async function fetchLists(prefix: string, key: string): Promise<Record<string, unknown>[]> {
  const payload = await call<{ lists?: unknown }>(prefix, key, '/lists', {
    count: '100',
    fields: LIST_FIELDS,
  })
  return asArray(payload.lists).filter(isRecord)
}

/**
 * The automations, live ones first.
 *
 * Ones that have never sent are dropped: two of the seven on this account are
 * unstarted drafts, and a row of noughts beside a running series is furniture
 * that invites the reader to wonder what broke.
 *
 * The totals are lifetime and cannot be otherwise — Mailchimp reports an
 * automation only as a running sum since it started, with no endpoint that
 * cuts it to a date range. Sorted by status before volume so the ones still
 * sending lead, whatever their size relative to a large paused series.
 */
async function fetchAutomations(
  prefix: string,
  key: string,
): Promise<MailchimpAutomation[]> {
  const payload = await call<{ automations?: unknown }>(prefix, key, '/automations', {
    count: '100',
    fields: AUTOMATION_FIELDS,
  })

  return asArray(payload.automations)
    .filter(isRecord)
    .map((row): MailchimpAutomation => {
      const settings = isRecord(row.settings) ? row.settings : {}
      const summary = isRecord(row.report_summary) ? row.report_summary : {}
      const started = row.start_time
      return {
        id: typeof row.id === 'string' ? row.id : '',
        title: typeof settings.title === 'string' && settings.title
          ? settings.title
          : '(untitled automation)',
        status: typeof row.status === 'string' ? row.status : '',
        startedAt: typeof started === 'string' ? started : null,
        emailsSent: num(row.emails_sent),
        openRate: num(summary.open_rate),
        clickRate: num(summary.click_rate),
      }
    })
    .filter((a) => a.emailsSent > 0)
    .sort((a, b) => {
      const live = (s: string) => (s === 'sending' ? 0 : 1)
      return live(a.status) - live(b.status) || b.emailsSent - a.emailsSent
    })
}

/**
 * Customer Journeys — the Automation flows tab of Mailchimp's own UI.
 *
 * A second endpoint entirely, and one the API root does not advertise. Read
 * separately from `/automations` because it is separate: asking `/reports` for
 * `type=automation` returns nothing, and asking `/automations` returns only
 * the Classic tab. A dashboard wanting both has to call both.
 *
 * Live journeys lead, then the largest. Journeys nobody has entered are
 * dropped, as the unstarted automations are — a row of noughts beside a
 * running flow invites the reader to wonder what broke.
 */
async function fetchJourneys(
  prefix: string,
  key: string,
): Promise<MailchimpJourney[]> {
  const payload = await call<{ journeys?: unknown }>(
    prefix,
    key,
    '/customer-journeys/journeys',
    { count: '100' },
  )

  return asArray(payload.journeys)
    .filter(isRecord)
    .map((row): MailchimpJourney => {
      const stats = isRecord(row.stats) ? row.stats : {}
      const started = row.first_started_at
      return {
        id: num(row.id),
        name:
          typeof row.journey_name === 'string' && row.journey_name
            ? row.journey_name
            : '(untitled journey)',
        status: typeof row.status === 'string' ? row.status : '',
        listName: typeof row.list_name === 'string' ? row.list_name : '',
        started: num(stats.started),
        inProgress: num(stats.in_progress),
        completed: num(stats.completed),
        startedAt: typeof started === 'string' ? started : null,
      }
    })
    .filter((j) => j.started > 0)
    .sort((a, b) => {
      const live = (s: string) => (s === 'sending' ? 0 : 1)
      return live(a.status) - live(b.status) || b.started - a.started
    })
}

/**
 * The newest send on the account, whatever the window. One row is enough.
 *
 * It carries the sector benchmark as well as the date, so that a window with
 * no campaigns in it still has one to set the automations against. The
 * benchmark is a slow-moving average for the whole eCommerce sector rather
 * than anything about this period, so reading it off July's send while looking
 * at August costs nothing in accuracy.
 */
async function fetchLatestSend(
  prefix: string,
  key: string,
): Promise<{ sendTime: string | null; benchmark: MailchimpBenchmark | null }> {
  const payload = await call<{ reports?: unknown }>(prefix, key, '/reports', {
    count: '1',
    sort_field: 'send_time',
    sort_dir: 'DESC',
    fields: 'reports.send_time,reports.industry_stats',
  })
  const rows = asArray(payload.reports).filter(isRecord)
  return {
    sendTime: typeof rows[0]?.send_time === 'string' ? rows[0].send_time : null,
    benchmark: benchmarkOf(rows),
  }
}

function toCampaign(row: Record<string, unknown>): MailchimpCampaign {
  const opens = isRecord(row.opens) ? row.opens : {}
  const clicks = isRecord(row.clicks) ? row.clicks : {}
  const bounces = isRecord(row.bounces) ? row.bounces : {}
  const sent = num(row.emails_sent)
  const proxyOpens = opens.proxy_excluded_unique_opens

  return {
    id: typeof row.id === 'string' ? row.id : '',
    title: typeof row.campaign_title === 'string' ? row.campaign_title : '(untitled)',
    subject: typeof row.subject_line === 'string' ? row.subject_line : '',
    listName: typeof row.list_name === 'string' ? row.list_name : '',
    sentAt: typeof row.send_time === 'string' ? row.send_time : '',
    emailsSent: sent,
    uniqueOpens: num(opens.unique_opens),
    // Left as the fraction Mailchimp reports. Rounding here would collapse the
    // click rates on this account — a third of a percent — to zero.
    openRate: num(opens.open_rate),
    // Struck against emails sent rather than taken from a field: Mailchimp
    // reports the proxy-excluded count but not its rate. Null rather than zero
    // where the count is absent, so a campaign Mailchimp never measured is not
    // read as one nobody genuinely opened.
    proxyExcludedOpenRate:
      proxyOpens === undefined || proxyOpens === null || sent === 0
        ? null
        : num(proxyOpens) / sent,
    uniqueClicks: num(clicks.unique_subscriber_clicks),
    clickRate: num(clicks.click_rate),
    unsubscribed: num(row.unsubscribed),
    bounces: num(bounces.hard_bounces) + num(bounces.soft_bounces),
  }
}

/**
 * The window as one set of figures, each against the same cut of the window
 * before it.
 *
 * Rates are struck from the summed totals, never averaged across campaigns —
 * see the note on `MailchimpTotals`.
 */
function totalsOf(
  campaigns: MailchimpCampaign[],
  previous: MailchimpCampaign[] | null,
): MailchimpTotals {
  const now = sum(campaigns)
  const before = previous ? sum(previous) : null

  /** A count against its baseline, or with none where comparison is off. */
  const count = (pick: (s: Sums) => number) =>
    before === null
      ? metric(pick(now), null)
      : metric(pick(now), deltaPct(pick(now), pick(before)), pick(before))

  /**
   * A rate against its baseline.
   *
   * The delta is in percentage points of relative change, as every other rate
   * on the dashboard is — so a 10% open rate that became 11% reads as +10%,
   * consistent with the rest of the page rather than with itself.
   */
  const rate = (pick: (s: Sums) => number, over: (s: Sums) => number) => {
    const value = over(now) === 0 ? 0 : pick(now) / over(now)
    if (before === null) return metric(value, null)
    const was = over(before) === 0 ? 0 : pick(before) / over(before)
    return metric(value, deltaPct(value, was), was)
  }

  return {
    campaigns: count((s) => s.campaigns),
    emailsSent: count((s) => s.emailsSent),
    opens: count((s) => s.opens),
    clicks: count((s) => s.clicks),
    unsubscribed: count((s) => s.unsubscribed),
    bounces: count((s) => s.bounces),
    openRate: rate((s) => s.opens, (s) => s.emailsSent),
    clickRate: rate((s) => s.clicks, (s) => s.emailsSent),
    unsubscribeRate: rate((s) => s.unsubscribed, (s) => s.emailsSent),
  }
}

interface Sums {
  campaigns: number
  emailsSent: number
  opens: number
  clicks: number
  unsubscribed: number
  bounces: number
}

function sum(campaigns: MailchimpCampaign[]): Sums {
  return campaigns.reduce<Sums>(
    (acc, c) => ({
      campaigns: acc.campaigns + 1,
      emailsSent: acc.emailsSent + c.emailsSent,
      opens: acc.opens + c.uniqueOpens,
      clicks: acc.clicks + c.uniqueClicks,
      unsubscribed: acc.unsubscribed + c.unsubscribed,
      bounces: acc.bounces + c.bounces,
    }),
    { campaigns: 0, emailsSent: 0, opens: 0, clicks: 0, unsubscribed: 0, bounces: 0 },
  )
}

/**
 * The window's opens with Apple Mail's automatic ones stripped out.
 *
 * Only campaigns that reported a proxy-excluded count are counted, on both
 * sides of the division — mixing in the sends that did not would divide a
 * partial numerator by a whole denominator and understate the rate.
 */
function proxyRateOf(campaigns: MailchimpCampaign[]): number | null {
  const measured = campaigns.filter((c) => c.proxyExcludedOpenRate !== null)
  if (measured.length === 0) return null

  const sent = measured.reduce((total, c) => total + c.emailsSent, 0)
  if (sent === 0) return null

  const opens = measured.reduce(
    (total, c) => total + (c.proxyExcludedOpenRate as number) * c.emailsSent,
    0,
  )
  return opens / sent
}

function benchmarkOf(rows: Record<string, unknown>[]): MailchimpBenchmark | null {
  for (const row of rows) {
    const stats = row.industry_stats
    if (!isRecord(stats)) continue
    return {
      openRate: num(stats.open_rate),
      clickRate: num(stats.click_rate),
      unsubRate: num(stats.unsub_rate),
      bounceRate: num(stats.bounce_rate),
    }
  }
  return null
}

function toAudiences(rows: Record<string, unknown>[]): MailchimpAudience[] {
  return rows
    .map((row): MailchimpAudience => {
      const stats = isRecord(row.stats) ? row.stats : {}
      const lastSent = stats.campaign_last_sent
      return {
        id: typeof row.id === 'string' ? row.id : '',
        name: typeof row.name === 'string' ? row.name : '(unnamed)',
        members: num(stats.member_count),
        unsubscribes: num(stats.unsubscribe_count),
        cleaned: num(stats.cleaned_count),
        // Divided by a hundred, unlike everywhere else in this file. A list's
        // rates arrive as percentages — 23.4 for 23.4% — while a campaign's
        // arrive as fractions. Both end up as fractions here so one formatter
        // serves the whole report.
        openRate: num(stats.open_rate) / 100,
        clickRate: num(stats.click_rate) / 100,
        subsPerMonth: num(stats.avg_sub_rate),
        unsubsPerMonth: num(stats.avg_unsub_rate),
        lastSentAt: typeof lastSent === 'string' ? lastSent : null,
      }
    })
    .sort((a, b) => b.members - a.members)
}
