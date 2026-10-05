/**
 * Mailchimp-tagged Meta and Gravity Forms leads, plus the contacts who have
 * never ordered. Customer tags are not lead sources; WooCommerce customer
 * history is used to identify which leads have already ordered.
 */
import type {
  BreakdownGrain,
  DateRange,
  LeadDayPoint,
  LeadReport,
  LeadSourceStats,
  UniqueContactPoint,
} from '../../src/lib/types'
import { metric } from '../../src/lib/derive'
import { bucketStart } from '../../src/lib/revenueBreakdown'
import { denyWithoutSession } from '../lib/auth'
import { BadRequest, isRecord, json, num, readComparison, readRange, toErrorResponse } from '../lib/http'
import { fetchFlodeskGravityEntries } from '../lib/flodeskLeadEntries'
import { fetchMailchimpLeadEntries } from '../lib/mailchimpLeadEntries'
import { fetchMetaLeadEntries, type MetaLeadEntry } from '../lib/metaLeads'

const META_PAGE_ID = process.env.META_LEAD_PAGE_ID?.trim() || '213491158815011'
const META_TIME_ZONE = process.env.META_LEAD_TIME_ZONE?.trim() || 'America/Los_Angeles'
const METORIK_BASE = 'https://app.metorik.com/api/v1/store'
const LOOKBACK_DAYS = 90
const EMAIL_BATCH_SIZE = 20
const EMAIL_BATCH_CONCURRENCY = 5
const ORDER_FACT_TTL_MS = 5 * 60 * 1000
const ERROR_HINT =
  'Meta and Gravity Forms leads or WooCommerce customer history could not be read. Check META_ACCESS_TOKEN, MAILCHIMP_API_KEY, MAILCHIMP_SERVER_PREFIX, FLODESK_API_KEY, and METORIK_API_KEY in the Netlify environment, then click Retry.'

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

interface OrderFact {
  orderCount: number
  firstOrderDate: string
}

const orderFactCache = new Map<string, { value: OrderFact; expiresAt: number }>()

/**
 * Actual Meta submissions and Mailchimp-tagged Gravity Forms contacts in the
 * selected range, with unique emails who have never placed a WooCommerce order.
 */
export default async function handler(request: Request): Promise<Response> {
  const denied = denyWithoutSession(request)
  if (denied) return denied

  try {
    const url = new URL(request.url)
    const range = readRange(url)
    const against = readComparison(url, range)
    const metaToken = process.env.META_ACCESS_TOKEN?.trim()
    const mailchimpKey = process.env.MAILCHIMP_API_KEY?.trim()
    const flodeskKey = process.env.FLODESK_API_KEY?.trim()
    const metorikKey = process.env.METORIK_API_KEY?.trim()
    if (!metaToken) throw new BadRequest('META_ACCESS_TOKEN is not configured')
    if (!mailchimpKey) throw new BadRequest('MAILCHIMP_API_KEY is not configured')
    if (!flodeskKey) throw new BadRequest('FLODESK_API_KEY is not configured')
    if (!metorikKey) throw new BadRequest('METORIK_API_KEY is not configured')
    const mailchimpPrefix = serverPrefix(mailchimpKey)

    const span = spanFor(range, against)
    const [metaEntries, mailchimpGravityEntries, flodeskGravityEntries] = await Promise.all([
      fetchMetaLeadEntries(META_PAGE_ID, metaToken, META_TIME_ZONE, span),
      fetchMailchimpLeadEntries(mailchimpKey, mailchimpPrefix, span),
      fetchFlodeskGravityEntries(flodeskKey, span),
    ])
    const entries: LeadEntry[] = [
      ...metaEntries.map(toMetaEntry),
      ...mailchimpGravityEntries,
      ...flodeskGravityEntries,
    ]
    const inScope = entries.filter((entry) => within(entry.day, range) || (against !== null && within(entry.day, against)))
    const emails = [...new Set(inScope.map((entry) => entry.email).filter(Boolean))]
    const orderFacts = await loadOrderFacts(metorikKey, emails)

    const leadRows = entries.map(toLeadRow)
    const nonBuyerRows = uniqueRowsByEmail(inScope
      .filter((entry) => entry.email && (orderFacts.get(entry.email)?.orderCount ?? 0) === 0)
      .map(toContactRow))

    const sources = {
      facebook: statsFor(leadRows.filter((row) => row.source === 'facebook'), range, against),
      gravity: statsFor(leadRows.filter((row) => row.source === 'gravity'), range, against),
    }
    const uniqueContacts = statsFor(nonBuyerRows, range, against)
    const report: LeadReport = {
      sources,
      uniqueContacts,
      series: seriesOf(leadRows, range),
      uniqueContactBuckets: {
        day: uniqueContactPointsOf(nonBuyerRows, range, 'day'),
        week: uniqueContactPointsOf(nonBuyerRows, range, 'week'),
        month: uniqueContactPointsOf(nonBuyerRows, range, 'month'),
      },
      campaigns: formsIn(leadRows, range),
      lastSeen: {
        facebook: latestDay(leadRows.filter((row) => row.source === 'facebook')),
        gravity: latestDay(leadRows.filter((row) => row.source === 'gravity')),
      },
    }

    return json(report)
  } catch (err) {
    return toErrorResponse(err, ERROR_HINT)
  }
}

/* ------------------------- WooCommerce matching ------------------------ */

async function loadOrderFacts(apiKey: string, emails: string[]): Promise<Map<string, OrderFact>> {
  const now = Date.now()
  const facts = new Map<string, OrderFact>()
  const pending = [...new Set(emails)].filter((email) => {
    const cached = orderFactCache.get(email)
    if (!cached || cached.expiresAt <= now) return true
    facts.set(email, cached.value)
    return false
  })

  const batches: string[][] = []
  for (let i = 0; i < pending.length; i += EMAIL_BATCH_SIZE) {
    batches.push(pending.slice(i, i + EMAIL_BATCH_SIZE))
  }

  for (let i = 0; i < batches.length; i += EMAIL_BATCH_CONCURRENCY) {
    const wave = batches.slice(i, i + EMAIL_BATCH_CONCURRENCY)
    const results = await Promise.all(wave.map((batch) => customerFactsForBatch(apiKey, batch)))
    for (let j = 0; j < wave.length; j += 1) {
      const batchFacts = results[j]
      for (const email of wave[j]) {
        const value = batchFacts.get(email) ?? { orderCount: 0, firstOrderDate: '' }
        facts.set(email, value)
        orderFactCache.set(email, { value, expiresAt: now + ORDER_FACT_TTL_MS })
      }
    }
  }

  return facts
}

async function customerFactsForBatch(apiKey: string, emails: string[]): Promise<Map<string, OrderFact>> {
  const params = new URLSearchParams({
    filters: JSON.stringify([{ field: 'email', operator: 'in', value: emails }]),
    per_page: '100',
    page: '1',
  })
  const response = await fetch(`${METORIK_BASE}/customers?${params}`, {
    headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`WooCommerce customer lookup failed (HTTP ${response.status})`)
  }

  const found = new Map<string, OrderFact>()
  if (!isRecord(body)) return found
  for (const row of Array.isArray(body.data) ? body.data.filter(isRecord) : []) {
    const email = String(row.email ?? '').trim().toLowerCase()
    if (!email) continue
    found.set(email, {
      orderCount: Math.max(0, Math.round(num(row.order_count))),
      firstOrderDate: typeof row.first_order_date === 'string' ? row.first_order_date.slice(0, 10) : '',
    })
  }
  return found
}

/* ------------------------------ Counting ------------------------------- */

const within = (day: string, range: DateRange): boolean =>
  day >= range.start && day <= range.end

function toMetaEntry(entry: MetaLeadEntry): LeadEntry {
  return { ...entry, label: entry.form, source: 'facebook' }
}

function toLeadRow(entry: LeadEntry): Row {
  return {
    day: entry.day,
    key: entry.source === 'facebook' ? entry.id : entry.email,
    source: entry.source,
    cells: { email: entry.email, 'form name': entry.label },
  }
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
  const today = new Date().toISOString().slice(0, 10)
  const floor = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10)
  const starts = [range.start, floor]
  const ends = [range.end, today]
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
  const sourceContacts = uniqueRowsByEmail(rows.filter((row) => row.cells.email), true)
  for (const row of sourceContacts) {
    if (!within(row.day, range)) continue
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
  const deduplicated = uniqueRowsByEmail(rows, true).map((row) =>
    row.source === 'gravity'
      ? { ...row, cells: { ...row.cells, 'form name': 'Learn Barehand (Mailchimp + Flodesk)' } }
      : row,
  )
  for (const row of deduplicated) {
    if (!within(row.day, range)) continue
    const prefix = row.source === 'facebook' ? 'Meta form' : 'Gravity Forms tag'
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
