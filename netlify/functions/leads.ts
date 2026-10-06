/**
 * Meta and Gravity Forms leads: the contacts Make.com tags as FB leads in
 * Mailchimp Raww Gym Tips, and the Gravity Forms entries, from Make.com's log
 * sheet for the old Learn Barehand form and from Gravity Forms itself for the
 * Barehand popup that replaced it. FB Lead-Ads tag dates and Meta submission days come from the store
 * `fb-lead-tags-background` keeps. Customer tags are not lead sources;
 * WooCommerce order history, read from the index `woo-orders-background`
 * keeps, is used to identify previous and later purchases.
 */
import type {
  BreakdownGrain,
  DateRange,
  LeadDayPoint,
  LeadPurchaseContact,
  LeadCampaignOutcome,
  LeadPurchaseReport,
  LeadReport,
  LeadSourceKey,
  LeadSourceStats,
  UniqueContactPoint,
} from '../../src/lib/types'
import { metric } from '../../src/lib/derive'
import { bucketStart } from '../../src/lib/revenueBreakdown'
import { denyWithoutSession, serviceHeaders } from '../lib/auth'
import { BadRequest, json, readComparison, readRange, toErrorResponse } from '../lib/http'
import { fetchCampaignLeadInsights, normaliseAccountId, type CampaignLeadInsight } from '../lib/metaLeads'
import {
  isFbLeadAdsTag,
  isGravityLeadTag,
  isMetaLeadTag,
  needsRefresh,
  readFbLeadTagDates,
  type LeadTagContact,
  type FbLeadTagDates,
} from '../lib/fbLeadTags'
import { fetchFormEntries, gravityFormsCredentials, type FormEntry } from '../lib/gravityForms'
import { fetchSheetEntries, type SheetEntry } from '../lib/leadSheet'
import { fetchLeadTagContacts, type LeadContactFilter } from '../lib/mailchimpLeadEntries'
import { wooCredentials } from '../lib/woo'
import {
  readWooOrderHistory,
  wooOrderHistoryNeedsRefresh,
  type OrderFact,
  type WooOrderHistory,
} from '../lib/wooOrderIndex'

const TRIGGER_TIMEOUT_MS = 3000
/** Contacts changed this long before the stored list was read are read again, against clock drift. */
const TOP_UP_OVERLAP_MS = 10 * 60_000
/** However stale the stored list, the live read never reaches further back than this. */
const TOP_UP_MAX_MS = 2 * 86_400_000
const ERROR_HINT =
  'Mailchimp leads or WooCommerce order history could not be read. Check MAILCHIMP_API_KEY, MAILCHIMP_SERVER_PREFIX, WOO_STORE_URL, WOO_CONSUMER_KEY, and WOO_CONSUMER_SECRET in the Netlify environment, then click Retry.'
const NO_ORDERS: OrderFact = { orderCount: 0, firstOrderDate: '', lastOrderDate: '' }

interface LeadEntry {
  id: string
  day: string
  email: string
  label: string
  source: 'facebook' | 'gravity'
}

interface Row {
  day: string
  key: string
  source: 'facebook' | 'gravity'
  cells: Record<string, string>
}

/** Mailchimp's FB lead and Gravity Forms contacts, matched to WooCommerce order history. */
export default async function handler(request: Request): Promise<Response> {
  const denied = denyWithoutSession(request)
  if (denied) return denied

  try {
    const url = new URL(request.url)
    const range = readRange(url)
    const against = readComparison(url, range)
    const mailchimpKey = process.env.MAILCHIMP_API_KEY?.trim()
    if (!mailchimpKey) throw new BadRequest('MAILCHIMP_API_KEY is not configured')
    if (!wooCredentials()) {
      throw new BadRequest('WOO_STORE_URL, WOO_CONSUMER_KEY and WOO_CONSUMER_SECRET are not configured')
    }
    const mailchimpPrefix = serverPrefix(mailchimpKey)

    const span = spanFor(range, against)
    const gravityCreds = gravityFormsCredentials()
    const metaToken = process.env.META_ACCESS_TOKEN?.trim()
    const metaAccount = process.env.META_AD_ACCOUNT_ID?.trim()
    // Without Blobs the leads still load, from the live read alone.
    const storedLeads = readFbLeadTagDates().catch((): FbLeadTagDates => ({
      updatedAt: null,
      startedAt: null,
      dates: {},
      leadDays: {},
      leadCampaigns: {},
      contacts: [],
      contactsReadAt: null,
      pending: 0,
    }))
    const [fbTagDates, contacts, sheetEntries, formEntries, orderHistory, campaignInsights] = await Promise.all([
      storedLeads,
      storedLeads.then((stored) => currentContacts(mailchimpKey, mailchimpPrefix, stored, span)),
      // Without the sheet, Gravity Forms leads fall back to Mailchimp opt-in.
      fetchSheetEntries().catch((err) => {
        console.error('[leads] entries sheet unavailable:', err instanceof Error ? err.message : err)
        return null
      }),
      gravityCreds
        ? fetchFormEntries(gravityCreds, span).catch((err) => {
            console.error('[leads] Gravity Forms entries unavailable:', err instanceof Error ? err.message : err)
            return null
          })
        : null,
      // Without Blobs the leads still load, marked as having no order history yet.
      readWooOrderHistory().catch((err): WooOrderHistory => {
        console.error('[leads] order history unreadable:', err instanceof Error ? err.message : err)
        return {
          ready: false,
          progress: 0,
          updatedAt: null,
          facts: new Map(),
          run: { startedAt: null, savedAt: null, finishedAt: null },
        }
      }),
      // Spend and Meta's own lead counts only annotate the campaign table.
      metaToken && metaAccount
        ? fetchCampaignLeadInsights(normaliseAccountId(metaAccount), metaToken, range).catch((err) => {
            console.error('[leads] Meta campaign insights unavailable:', err instanceof Error ? err.message : err)
            return null
          })
        : null,
    ])
    const refreshing = Promise.all([
      needsRefresh(fbTagDates) ? startBackground(url.origin, 'fb-lead-tags-background') : undefined,
      wooOrderHistoryNeedsRefresh(orderHistory) ? startBackground(url.origin, 'woo-orders-background') : undefined,
    ])
    const orderFacts = orderHistory.facts
    const entries: LeadEntry[] = [
      ...metaLeadEntries(contacts.filter((contact) => isMetaLeadTag(contact.tag)), fbTagDates),
      ...gravityLeadEntries(sheetEntries, formEntries, contacts.filter((contact) => isGravityLeadTag(contact.tag))),
    ]
    const inScope = entries.filter((entry) => within(entry.day, range) || (against !== null && within(entry.day, against)))
    const inRange = inScope.filter((entry) => within(entry.day, range))
    const metaLeadsInRange = firstLeadDays(inRange, 'facebook')
    const leadPurchases = {
      facebook: purchaseReport('Meta leads', metaLeadsInRange, orderFacts, (email) =>
        fbTagDates.leadCampaigns[email]?.name ?? null,
      ),
      gravity: purchaseReport('Gravity Forms leads', firstLeadDays(inRange, 'gravity'), orderFacts),
    }

    const leadRows = entries.map(toLeadRow)
    const nonBuyerRows = uniqueRowsByEmail(inScope
      .filter((entry) => entry.email && (orderFacts.get(entry.email)?.orderCount ?? 0) === 0)
      .map(toContactRow))

    const sources = {
      facebook: statsFor(leadRows.filter((row) => row.source === 'facebook'), range, against),
      gravity: statsFor(leadRows.filter((row) => row.source === 'gravity'), range, against),
    }
    const uniqueContacts = statsFor(nonBuyerRows, range, against)
    const gravityWithoutOrders = statsFor(
      leadRows.filter((row) =>
        row.source === 'gravity' && (orderFacts.get(row.cells.email)?.orderCount ?? 0) === 0,
      ),
      range,
      against,
    )
    const report: LeadReport = {
      sources,
      uniqueContacts,
      gravityWithoutOrders,
      series: seriesOf(leadRows, range),
      uniqueContactBuckets: {
        day: uniqueContactPointsOf(nonBuyerRows, range, 'day'),
        week: uniqueContactPointsOf(nonBuyerRows, range, 'week'),
        month: uniqueContactPointsOf(nonBuyerRows, range, 'month'),
      },
      campaigns: formsIn(leadRows, range),
      leadPurchases,
      metaCampaigns: campaignOutcomes(metaLeadsInRange, fbTagDates.leadCampaigns, campaignInsights, orderFacts),
      orderHistory: {
        ready: orderHistory.ready,
        progress: orderHistory.progress,
        updatedAt: orderHistory.updatedAt,
      },
      lastSeen: {
        facebook: latestDay(leadRows.filter((row) => row.source === 'facebook')),
        gravity: latestDay(leadRows.filter((row) => row.source === 'gravity')),
      },
    }

    await refreshing
    return json(report)
  } catch (err) {
    return toErrorResponse(err, ERROR_HINT)
  }
}

/* ------------------------------ Counting ------------------------------- */

const within = (day: string, range: DateRange): boolean =>
  day >= range.start && day <= range.end

/**
 * The stored lead contacts, topped up with every contact changed since they
 * were read, so an entry made since the last background refresh still counts.
 * Before the store holds Gravity Forms contacts at all, those in the span are
 * read by opt-in instead, as they were before the store kept them.
 */
async function currentContacts(
  apiKey: string,
  serverPrefix: string,
  stored: FbLeadTagDates,
  span: { start: string; end: string },
): Promise<LeadTagContact[]> {
  const readAt = stored.contactsReadAt ? Date.parse(stored.contactsReadAt) : Number.NaN
  const hasGravity = stored.contacts.some((contact) => isGravityLeadTag(contact.tag))
  const filter: LeadContactFilter = hasGravity && Number.isFinite(readAt)
    ? {
        changedSince: `${new Date(Math.max(readAt - TOP_UP_OVERLAP_MS, Date.now() - TOP_UP_MAX_MS)).toISOString().slice(0, 19)}+00:00`,
      }
    : { optedIn: span }
  const recent = await fetchLeadTagContacts(apiKey, serverPrefix, filter)
  const byTag = new Map(stored.contacts.map((contact) => [`${contact.email}|${contact.tag}`, contact]))
  for (const contact of recent) byTag.set(`${contact.email}|${contact.tag}`, contact)
  return [...byTag.values()]
}

/**
 * Gravity Forms leads: every entry, on the day it was submitted, so someone
 * already subscribed who fills a form again counts that day. Mailchimp's own
 * dates cannot do this (see `leadSheet`). The old Learn Barehand form's
 * entries come from Make.com's log sheet; the Barehand popup that replaced it
 * on 3 October is not in that log, so its entries come from Gravity Forms.
 * Before the log begins, or if it cannot be read, Learn Barehand contacts
 * stand in on the day they opted in.
 */
function gravityLeadEntries(
  sheet: SheetEntry[] | null,
  forms: FormEntry[] | null,
  contacts: LeadTagContact[],
): LeadEntry[] {
  const logStart = sheet?.reduce<string | null>((min, entry) => (!min || entry.day < min ? entry.day : min), null) ?? null
  const logged = (sheet ?? []).map((entry): LeadEntry => ({
    id: entry.email,
    day: entry.day,
    email: entry.email,
    label: 'Learn Barehand',
    source: 'gravity',
  }))
  const submitted = (forms ?? []).map((entry): LeadEntry => ({
    id: entry.email,
    day: entry.day,
    email: entry.email,
    label: entry.form,
    source: 'gravity',
  }))
  const beforeLog = contacts.flatMap((contact): LeadEntry[] =>
    contact.optInDay && (!logStart || contact.optInDay < logStart)
      ? [{
          id: contact.email,
          day: contact.optInDay,
          email: contact.email,
          label: 'Learn Barehand',
          source: 'gravity',
        }]
      : [],
  )
  return [...logged, ...submitted, ...beforeLog]
}

/**
 * Mailchimp's FB lead contacts, each dated by the first day there is evidence
 * they were a lead. Make.com tags in batches weeks apart, so for `FB Lead- Ads`
 * the tag date is only an upper bound: the Meta submission day where it was
 * recorded, the ENTRYDATE Make.com writes, and the signup day are earlier and
 * closer. Older FB tags were applied as contacts joined, so their opt-in day
 * stands in for the tag date, as it does for anyone not dated yet.
 */
function metaLeadEntries(contacts: LeadTagContact[], stored: FbLeadTagDates): LeadEntry[] {
  return contacts.flatMap((contact) => {
    const known = [contact.entryDay, contact.signupDay, stored.leadDays[contact.email]]
    known.push(isFbLeadAdsTag(contact.tag) ? stored.dates[contact.email] : contact.optInDay)
    const days = known.filter((day): day is string => !!day)
    const day = days.length > 0 ? days.reduce((a, b) => (a < b ? a : b)) : contact.optInDay
    if (!day) return []
    return [{ id: contact.email, day, email: contact.email, label: contact.tag, source: 'facebook' as const }]
  })
}

function toLeadRow(entry: LeadEntry): Row {
  return {
    day: entry.day,
    key: entry.source === 'facebook' ? entry.id : entry.email,
    source: entry.source,
    cells: { email: entry.email, 'form name': entry.label },
  }
}

/** One row per email for a source, on the first day it became a lead. */
function firstLeadDays(entries: LeadEntry[], source: LeadSourceKey): { email: string; day: string }[] {
  const firstByEmail = new Map<string, string>()
  for (const entry of entries) {
    if (entry.source !== source || !entry.email) continue
    const current = firstByEmail.get(entry.email)
    if (!current || entry.day < current) firstByEmail.set(entry.email, entry.day)
  }
  return [...firstByEmail].map(([email, day]) => ({ email, day }))
}

/**
 * Asks a background function to bring its store up to date: the FB Lead-Ads
 * tag dates or the WooCommerce order index. Netlify answers 202 straight away;
 * the timeout keeps a slow answer from holding up the report, and a missed
 * start only waits for the hourly run.
 */
async function startBackground(origin: string, name: string): Promise<void> {
  try {
    await fetch(`${origin}/.netlify/functions/${name}`, {
      method: 'POST',
      headers: serviceHeaders(),
      signal: AbortSignal.timeout(TRIGGER_TIMEOUT_MS),
    })
  } catch {
    /* The hourly cron tries again. */
  }
}

/**
 * Each contact's Woo history against the day they became a lead, buyers or
 * not, so the dashboard can filter the list either way. `campaignOf` names
 * the Meta campaign behind a contact where one is on record.
 */
function purchaseReport(
  tag: string,
  entries: { email: string; day: string }[],
  orderFacts: Map<string, OrderFact>,
  campaignOf: (email: string) => string | null = () => null,
): LeadPurchaseReport {
  const contacts: LeadPurchaseContact[] = entries.map((entry) => {
    const fact = orderFacts.get(entry.email) ?? NO_ORDERS
    return {
      email: entry.email,
      addedAt: entry.day,
      campaign: campaignOf(entry.email),
      orderCount: fact.orderCount,
      firstOrderDate: fact.firstOrderDate || null,
      lastOrderDate: fact.lastOrderDate || null,
      purchasedBefore: !!fact.firstOrderDate && fact.firstOrderDate < entry.day,
      purchasedAfter: !!fact.lastOrderDate && fact.lastOrderDate > entry.day,
    }
  }).sort((a, b) => b.addedAt.localeCompare(a.addedAt) || a.email.localeCompare(b.email))

  const total = contacts.length
  const previouslyPurchased = contacts.filter((contact) => contact.purchasedBefore).length
  const purchasedAfter = contacts.filter((contact) => contact.purchasedAfter).length
  const noPurchase = contacts.filter((contact) => contact.orderCount === 0).length
  const sameDayOrUnknown = contacts.filter((contact) =>
    contact.orderCount > 0 && !contact.purchasedBefore && !contact.purchasedAfter,
  ).length
  return {
    tag,
    total,
    previouslyPurchased,
    purchasedAfter,
    noPurchase,
    sameDayOrUnknown: Math.max(0, sameDayOrUnknown),
    conversionRate: total ? purchasedAfter / total : 0,
    contacts,
  }
}

/**
 * Each Meta campaign's leads in the range: what Meta reports for it, and what
 * the Meta leads it brought into Mailchimp went on to buy. A lead is tied to
 * a campaign by the Meta submission recorded for its email; one with none on
 * record (organic, or submitted before Meta's 90 days were first read) is
 * kept in its own row rather than dropped. Campaigns that spent without
 * bringing a lead are listed too, since that is half the answer.
 */
function campaignOutcomes(
  leads: { email: string; day: string }[],
  campaignsByEmail: FbLeadTagDates['leadCampaigns'],
  insights: Map<string, CampaignLeadInsight> | null,
  orderFacts: Map<string, OrderFact>,
): LeadCampaignOutcome[] {
  const groups = new Map<string, { name: string; leads: { email: string; day: string }[] }>()
  for (const lead of leads) {
    const campaign = campaignsByEmail[lead.email]
    const id = campaign?.id ?? ''
    const group = groups.get(id) ?? { name: campaign?.name || 'No campaign on record', leads: [] }
    group.leads.push(lead)
    groups.set(id, group)
  }
  for (const [id, insight] of insights ?? []) {
    if (!groups.has(id) && (insight.spend > 0 || insight.leads > 0)) groups.set(id, { name: insight.name, leads: [] })
  }

  return [...groups]
    .map(([id, group]): LeadCampaignOutcome => {
      const outcome = purchaseReport(group.name, group.leads, orderFacts)
      const insight = id ? insights?.get(id) : undefined
      const known = id !== '' && insights !== null
      return {
        campaign: insight?.name ?? group.name,
        spend: known ? insight?.spend ?? 0 : null,
        metaLeads: known ? insight?.leads ?? 0 : null,
        formLeads: outcome.total,
        noOrders: outcome.noPurchase,
        boughtBefore: outcome.previouslyPurchased,
        boughtAfter: outcome.purchasedAfter,
      }
    })
    .sort((a, b) =>
      b.formLeads - a.formLeads || (b.metaLeads ?? 0) - (a.metaLeads ?? 0) || (b.spend ?? 0) - (a.spend ?? 0),
    )
}

function toContactRow(entry: LeadEntry): Row {
  return {
    day: entry.day,
    key: entry.email,
    source: entry.source,
    cells: { email: entry.email, 'form name': entry.label },
  }
}

function countIn(rows: Row[], range: DateRange): number {
  const seen = new Set<string>()
  let unkeyed = 0
  for (const row of rows) {
    if (!within(row.day, range)) continue
    if (row.key) seen.add(row.key)
    else unkeyed += 1
  }
  return seen.size + unkeyed
}

function statsFor(rows: Row[], range: DateRange, against: DateRange | null): LeadSourceStats {
  const current = countIn(rows, range)
  const previous = against ? countIn(rows, against) : null
  const delta = previous === null || previous === 0 ? null : ((current - previous) / previous) * 100
  return { count: metric(current, delta, previous) }
}

function spanFor(range: DateRange, against: DateRange | null): { start: string; end: string } {
  const starts = [range.start]
  const ends = [range.end]
  if (against) {
    starts.push(against.start)
    ends.push(against.end)
  }
  return {
    start: starts.reduce((a, b) => (a < b ? a : b)),
    end: ends.reduce((a, b) => (a > b ? a : b)),
  }
}

function seriesOf(rows: Row[], range: DateRange): LeadDayPoint[] {
  const counts = new Map<string, Record<'facebook' | 'gravity', Set<string>>>()
  // Each contact once, on their first lead day within the range, so the
  // series adds up to the headline count. Someone who came back counts again.
  const sourceContacts = uniqueRowsByEmail(rows.filter((row) => row.cells.email && within(row.day, range)), true)
  for (const row of sourceContacts) {
    const day = counts.get(row.day) ?? { facebook: new Set<string>(), gravity: new Set<string>() }
    day[row.source].add(row.key || `${row.day}:${day[row.source].size}`)
    counts.set(row.day, day)
  }
  return eachDay(range).map((date) => ({
    date,
    facebook: counts.get(date)?.facebook.size ?? 0,
    gravity: counts.get(date)?.gravity.size ?? 0,
  }))
}

/** Count a contact once across tags and sources, on their first lead day. */
function uniqueRowsByEmail(rows: Row[], separateSources = false): Row[] {
  const firstByEmail = new Map<string, Row>()
  for (const row of rows) {
    if (!row.key) continue
    const key = separateSources ? `${row.source}:${row.key}` : row.key
    const first = firstByEmail.get(key)
    if (!first || row.day < first.day) firstByEmail.set(key, row)
  }
  return [...firstByEmail.values()]
}

function uniqueContactPointsOf(
  rows: Row[],
  range: DateRange,
  grain: BreakdownGrain,
): UniqueContactPoint[] {
  const counts = new Map<string, Set<string>>()
  for (const row of rows) {
    if (!within(row.day, range)) continue
    const bucket = bucketStart(row.day, grain)
    const seen = counts.get(bucket) ?? new Set<string>()
    seen.add(row.key)
    counts.set(bucket, seen)
  }
  return [...counts]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, seen]) => ({ date, contacts: seen.size }))
}

function eachDay(range: DateRange): string[] {
  const days: string[] = []
  const end = Date.parse(`${range.end}T00:00:00Z`)
  let at = Date.parse(`${range.start}T00:00:00Z`)
  if (!Number.isFinite(at) || !Number.isFinite(end)) return days
  while (at <= end && days.length < 400) {
    days.push(new Date(at).toISOString().slice(0, 10))
    at += 86_400_000
  }
  return days
}

function formsIn(rows: Row[], range: DateRange): LeadReport['campaigns'] {
  const byForm = new Map<string, Set<string>>()
  // Deduplicated within the range, as the headline counts are.
  const deduplicated = uniqueRowsByEmail(rows.filter((row) => within(row.day, range)), true)
  for (const row of deduplicated) {
    if (!within(row.day, range)) continue
    const prefix = row.source === 'facebook' ? 'Meta tag' : 'Gravity Forms'
    const form = `${prefix}: ${row.cells['form name'] || 'Unlabeled'}`
    const seen = byForm.get(form) ?? new Set<string>()
    seen.add(row.key)
    byForm.set(form, seen)
  }
  return [...byForm]
    .map(([name, seen]) => ({ name, leads: seen.size }))
    .sort((a, b) => b.leads - a.leads || a.name.localeCompare(b.name))
}

function latestDay(rows: Row[]): string | null {
  return rows.reduce<string | null>((latest, row) => (!latest || row.day > latest ? row.day : latest), null)
}

function serverPrefix(apiKey: string): string {
  const configured = process.env.MAILCHIMP_SERVER_PREFIX?.trim()
  if (configured) return configured
  const suffix = apiKey.slice(apiKey.lastIndexOf('-') + 1)
  if (!apiKey || suffix === apiKey || !/^[a-z\d]+$/i.test(suffix)) {
    throw new BadRequest('MAILCHIMP_SERVER_PREFIX is not configured')
  }
  return suffix
}
