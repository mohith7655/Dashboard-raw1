/**
 * List health, read from the Flodesk API.
 *
 * This is not the Mailchimp function with a different base URL, because
 * Flodesk does not expose the same thing. Its public API has no reporting
 * surface at all: `/campaigns` returns an id, a name, a subject, a status and
 * two timestamps, and there is no endpoint — and no field on that one — for
 * opens, clicks, recipients or a send time. `/reports` and `/analytics` are
 * both 404. So there is no open rate to show, and this function does not
 * invent one.
 *
 * What it can answer is how large the lists are, how they divide into
 * segments, and what has been sent. Engagement for Flodesk stays where it
 * already is — the Make.com sheet on the Lead Data tab counts the signups and
 * the orders those subscribers went on to place.
 *
 *   ?start=&end=
 */
import type {
  FlodeskCampaign,
  FlodeskReport,
  FlodeskSegment,
} from '../../src/lib/types'
import {
  asArray,
  isRecord,
  json,
  num,
  readRange,
  requireEnv,
  toErrorResponse,
} from '../lib/http'
import { denyWithoutSession } from '../lib/auth'

const API = 'https://api.flodesk.com/v1'
const SOURCE = 'Flodesk'
const HINT =
  'Flodesk could not be reached. Check FLODESK_API_KEY is a current key — Flodesk → Account → Integrations → Flodesk API — and note it authenticates as HTTP basic, the whole key as the username with no password. Then click Retry.'

/**
 * Flodesk asks integrations to identify themselves, and rejects some requests
 * that arrive without a user agent naming one.
 */
const USER_AGENT = 'Rawwgear Dashboard (netlify-functions)'

export default async function handler(request: Request): Promise<Response> {
  const denied = denyWithoutSession(request)
  if (denied) return denied

  try {
    const url = new URL(request.url)
    const range = readRange(url)
    const key = requireEnv('FLODESK_API_KEY').trim()

    /*
     * Five calls. Three of them ask for a single row and read the count off
     * the pagination envelope rather than the body — `meta.total_items` is the
     * whole answer, and fetching 73,000 subscribers to length an array would
     * be absurd.
     */
    const [history, segments, campaigns] = await Promise.all([
      fetchSubscriberHistory(key, range.start, range.end),
      fetchSegments(key),
      fetchCampaigns(key),
    ])

    const segmentRows = segments
      .map((segment) => ({
        ...segment,
        members: history.segmentMembers.get(segment.id) ?? 0,
      }))
      .sort((a, b) => b.members - a.members)

    // Only the ones that actually went out. A draft is a campaign that has not
    // happened, and counting it beside sends would overstate the activity.
    const done = campaigns
      .filter((c) => c.status === 'done')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

    const report: FlodeskReport = {
      subscribers: history.subscribers,
      subscriberHistoryAvailable: history.available,
      segments: segmentRows,
      // Compared as plain days rather than as timestamps: the range is two
      // `yyyy-MM-dd` strings and Flodesk's stamps carry microseconds and a
      // zone, so trimming both to the date is the one comparison that cannot
      // be thrown by a difference in precision.
      campaigns: done.filter((c) => {
        const day = c.updatedAt.slice(0, 10)
        return day >= range.start && day <= range.end
      }),
      lastCampaignAt: done.length ? done[0].updatedAt : null,
      campaignsAllTime: done.length,
    }
    return json(report)
  } catch (err) {
    return toErrorResponse(err, HINT)
  }
}

/**
 * Flodesk authenticates as HTTP basic with the whole key as the username and
 * no password — not as a bearer token, which it answers with a bare 401 and no
 * indication that the scheme is the problem.
 */
async function call<T>(
  key: string,
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const query = new URLSearchParams(params).toString()
  const res = await fetch(`${API}${path}${query ? `?${query}` : ''}`, {
    headers: {
      authorization: `Basic ${btoa(`${key}:`)}`,
      'user-agent': USER_AGENT,
    },
  })

  const text = await res.text()
  if (!res.ok) {
    let detail = text.slice(0, 300)
    try {
      const body: unknown = JSON.parse(text)
      if (isRecord(body) && typeof body.message === 'string') detail = body.message
    } catch {
      /* Not JSON; the raw text above is the best available message. */
    }
    throw new Error(`${SOURCE} responded ${res.status}: ${detail}`)
  }

  return JSON.parse(text) as T
}

const PAGE_SIZE = 100
// Keep room under Flodesk's 100 requests/minute limit for boundary searches
// and the segment/campaign calls made alongside this scan.
const MAX_HISTORY_PAGES = 70

interface Subscriber {
  id: string
  createdAt: string
  status: string
  segments: string[]
}

interface SubscriberHistory {
  available: boolean
  subscribers: { total: number; active: number; unsubscribed: number }
  segmentMembers: Map<string, number>
}

interface SubscriberPage {
  rows: Subscriber[]
  totalPages: number
}

/**
 * Flodesk has no created-date filter. Its API currently returns subscribers
 * newest-first, so binary-search page boundaries and read only pages that can
 * contain contacts created during the selected period. Status and segment
 * membership come from each contact's current record.
 */
async function fetchSubscriberHistory(
  key: string,
  start: string,
  end: string,
): Promise<SubscriberHistory> {
  const pageCache = new Map<number, SubscriberPage>()
  const getPage = async (page: number): Promise<SubscriberPage> => {
    const cached = pageCache.get(page)
    if (cached) return cached
    const payload = await call<{ data?: unknown; meta?: unknown }>(key, '/subscribers', {
      per_page: String(PAGE_SIZE),
      page: String(page),
    })
    const meta = isRecord(payload.meta) ? payload.meta : {}
    const rows = asArray(payload.data)
      .filter(isRecord)
      .map((row) => ({
        id: typeof row.id === 'string' ? row.id : '',
        createdAt: typeof row.created_at === 'string' ? row.created_at : '',
        status: typeof row.status === 'string' ? row.status : '',
        segments: asArray(row.segments)
          .filter(isRecord)
          .map((segment) => typeof segment.id === 'string' ? segment.id : '')
          .filter(Boolean),
      }))
    const totalItems = num(meta.total_items)
    const totalPages = num(meta.total_pages) || Math.ceil(totalItems / PAGE_SIZE)
    const result = { rows, totalPages }
    pageCache.set(page, result)
    return result
  }

  const empty = (available: boolean): SubscriberHistory => ({
    available,
    subscribers: { total: 0, active: 0, unsubscribed: 0 },
    segmentMembers: new Map(),
  })

  const first = await getPage(1)
  if (!first.totalPages || !first.rows.length) return empty(true)
  const final = first.totalPages === 1 ? first : await getPage(first.totalPages)
  if (!isNewestFirst(first.rows) || !isNewestFirst(final.rows)) return empty(false)

  // First page whose oldest row is on or before the selected end date.
  let lo = 1
  let hi = first.totalPages
  let firstPage = first.totalPages + 1
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    const page = await getPage(mid)
    if (!isNewestFirst(page.rows)) return empty(false)
    const oldest = page.rows.at(-1)?.createdAt.slice(0, 10) ?? ''
    if (oldest && oldest <= end) {
      firstPage = mid
      hi = mid - 1
    } else {
      lo = mid + 1
    }
  }

  // Last page whose newest row is on or after the selected start date.
  lo = 1
  hi = first.totalPages
  let lastPage = 0
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    const page = await getPage(mid)
    if (!isNewestFirst(page.rows)) return empty(false)
    const newest = page.rows[0]?.createdAt.slice(0, 10) ?? ''
    if (newest && newest >= start) {
      lastPage = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }

  if (firstPage > lastPage || !lastPage) return empty(true)
  if (lastPage - firstPage + 1 > MAX_HISTORY_PAGES) return empty(false)

  const pages: number[] = []
  for (let page = firstPage; page <= lastPage; page += 1) pages.push(page)
  // Chunk requests to avoid a large burst at Flodesk's account-wide API.
  for (let offset = 0; offset < pages.length; offset += 8) {
    await Promise.all(pages.slice(offset, offset + 8).map(getPage))
  }

  const contacts = new Map<string, Subscriber>()
  for (const pageNumber of pages) {
    const page = pageCache.get(pageNumber)
    if (!page || !isNewestFirst(page.rows)) return empty(false)
    const nextPage = pageCache.get(pageNumber + 1)
    if (nextPage) {
      const oldestHere = page.rows.at(-1)?.createdAt ?? ''
      const newestNext = nextPage.rows[0]?.createdAt ?? ''
      if (!oldestHere || !newestNext || oldestHere < newestNext) return empty(false)
    }
    for (const contact of page.rows) {
      const day = contact.createdAt.slice(0, 10)
      if (!day || day < start || day > end) continue
      if (!contact.id) return empty(false)
      contacts.set(contact.id, contact)
    }
  }

  const result = empty(true)
  result.subscribers.total = contacts.size
  for (const contact of contacts.values()) {
    if (contact.status === 'active') {
      result.subscribers.active += 1
      for (const segmentId of new Set(contact.segments)) {
        result.segmentMembers.set(segmentId, (result.segmentMembers.get(segmentId) ?? 0) + 1)
      }
    } else if (contact.status === 'unsubscribed') {
      result.subscribers.unsubscribed += 1
    }
  }
  return result
}

function isNewestFirst(rows: Subscriber[]): boolean {
  for (let i = 1; i < rows.length; i += 1) {
    const previous = rows[i - 1].createdAt
    const current = rows[i].createdAt
    if (!previous || !current || previous < current) return false
  }
  return true
}

async function fetchSegments(key: string): Promise<FlodeskSegment[]> {
  const payload = await call<{ data?: unknown }>(key, '/segments', { per_page: '100' })
  return asArray(payload.data)
    .filter(isRecord)
    .map((row) => ({
      id: typeof row.id === 'string' ? row.id : '',
      name: typeof row.name === 'string' ? row.name : '(unnamed)',
      members: 0,
      createdAt: typeof row.created_at === 'string' ? row.created_at : '',
    }))
    .sort((a, b) => b.members - a.members)
}

async function fetchCampaigns(key: string): Promise<FlodeskCampaign[]> {
  const payload = await call<{ data?: unknown }>(key, '/campaigns', { per_page: '100' })
  return asArray(payload.data)
    .filter(isRecord)
    .map((row) => ({
      id: typeof row.id === 'string' ? row.id : '',
      name: typeof row.name === 'string' ? row.name : '(untitled)',
      status: typeof row.status === 'string' ? row.status : '',
      subject: stripMarkup(typeof row.subject === 'string' ? row.subject : ''),
      createdAt: typeof row.created_at === 'string' ? row.created_at : '',
      updatedAt: typeof row.updated_at === 'string' ? row.updated_at : '',
    }))
}

/**
 * Flodesk returns the subject as a fragment of its editor's markup —
 * `<div data-paragraph="true">This Easter, stop losing reps</div>`. The tags
 * are stripped here rather than in the browser: the value is inserted as text
 * either way, so an unstripped subject would show its own markup to the reader.
 */
function stripMarkup(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}
