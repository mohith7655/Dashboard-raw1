/**
 * Meta instant-form leads and the contacts who have never ordered.
 * Website form/pixel events and email-platform membership are not lead sources
 * for this report. WooCommerce customer history is used only to identify which
 * Meta contacts have already ordered.
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
import { fetchMetaLeadEntries, type MetaLeadEntry } from '../lib/metaLeads'

const META_PAGE_ID = process.env.META_LEAD_PAGE_ID?.trim() || '213491158815011'
const META_TIME_ZONE = process.env.META_LEAD_TIME_ZONE?.trim() || 'America/Los_Angeles'
const METORIK_BASE = 'https://app.metorik.com/api/v1/store'
const LOOKBACK_DAYS = 90
const EMAIL_BATCH_SIZE = 20
const EMAIL_BATCH_CONCURRENCY = 5
const ORDER_FACT_TTL_MS = 5 * 60 * 1000
const ERROR_HINT =
  'Meta lead forms and WooCommerce customer history could not be read. Check META_ACCESS_TOKEN, META_LEAD_PAGE_ID, and METORIK_API_KEY in the Netlify environment, then click Retry.'

interface Row {
  day: string
  key: string
  cells: Record<string, string>
}

interface OrderFact {
  orderCount: number
  firstOrderDate: string
}

const orderFactCache = new Map<string, { value: OrderFact; expiresAt: number }>()

/**
 * Meta instant-form entries in the selected range, with unique email contacts
 * who have never placed a WooCommerce order.
 */
export default async function handler(request: Request): Promise<Response> {
  const denied = denyWithoutSession(request)
  if (denied) return denied

  try {
    const url = new URL(request.url)
    const range = readRange(url)
    const against = readComparison(url, range)
    const token = process.env.META_ACCESS_TOKEN?.trim()
    const metorikKey = process.env.METORIK_API_KEY?.trim()
    if (!token) throw new BadRequest('META_ACCESS_TOKEN is not configured')
    if (!metorikKey) throw new BadRequest('METORIK_API_KEY is not configured')

    const span = spanFor(range, against)
    const entries = await fetchMetaLeadEntries(META_PAGE_ID, token, META_TIME_ZONE, span)
    const inScope = entries.filter(
      (entry) => within(entry.day, range) || (against !== null && within(entry.day, against)),
    )
    const emails = [...new Set(inScope.map((entry) => entry.email).filter(Boolean))]
    const orderFacts = await loadOrderFacts(metorikKey, emails)

    const leadRows = entries.map(toLeadRow)
    const nonBuyerRows = inScope
      .filter((entry) => entry.email && (orderFacts.get(entry.email)?.orderCount ?? 0) === 0)
      .map(toContactRow)

    const sources = {
      facebook: statsFor(leadRows, range, against),
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
        facebook: latestDay(leadRows),
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

function toLeadRow(entry: MetaLeadEntry): Row {
  return {
    day: entry.day,
    key: entry.id,
    cells: { email: entry.email, 'form name': entry.form },
  }
}

function toContactRow(entry: MetaLeadEntry): Row {
  return {
    day: entry.day,
    key: entry.email,
    cells: { email: entry.email, 'form name': entry.form },
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
  const counts = new Map<string, Set<string>>()
  for (const row of rows) {
    if (!within(row.day, range)) continue
    const day = counts.get(row.day) ?? new Set<string>()
    day.add(row.key || `${row.day}:${day.size}`)
    counts.set(row.day, day)
  }
  return eachDay(range).map((date) => ({
    date,
    facebook: counts.get(date)?.size ?? 0,
  }))
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
  for (const row of rows) {
    if (!within(row.day, range)) continue
    const form = row.cells['form name'] || 'Unnamed Meta form'
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
