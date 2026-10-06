/** Gravity Forms tagged contacts from the Raww Gym Tips audience. */
import { isRecord, num } from './http'

const PAGE_SIZE = 1000
// Mailchimp allows ten simultaneous connections per account, and the Mailchimp
// function opens six of its own while the Leads tab is loading.
const PAGE_CONCURRENCY = 4
const TAG_CACHE_MS = 5 * 60 * 1000
const MEMBER_FIELDS = 'members.id,members.email_address,members.timestamp_opt,members.tags,total_items'

export interface MailchimpLeadEntry {
  id: string
  day: string
  email: string
  label: string
  source: 'gravity'
}

export interface MailchimpLeadCollections {
  gravity: MailchimpLeadEntry[]
}

interface MailchimpList {
  id: string
  name: string
}

interface MailchimpPage {
  total_items?: number
  lists?: unknown[]
  members?: unknown[]
}

const cache = new Map<string, { expiresAt: number; value: MailchimpLeadCollections }>()

/**
 * Read the Gravity Forms tag from the Raww Gym Tips audience. Make.com's FB
 * lead contacts, with their dates, come from the store `fbLeadTags` keeps,
 * and WooCommerce supplies customer/order history. Customer and year tags are
 * not lead sources.
 */
export async function fetchMailchimpLeadEntries(
  apiKey: string,
  serverPrefix: string,
  span: { start: string; end: string },
): Promise<MailchimpLeadCollections> {
  const cacheKey = `${serverPrefix}:${span.start}:${span.end}`
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return inSpan(cached.value, span)

  const lists = (await getLists(apiKey, serverPrefix)).filter(
    (list) => list.name.trim().toLowerCase() === 'raww gym tips',
  )
  const results: MailchimpLeadEntry[][] = []
  for (const list of lists) {
    results.push(await getTaggedMembers(apiKey, serverPrefix, list.id, span))
  }

  // Keep each tag row for form/tag attribution. Dashboard totals and the daily
  // graph deduplicate by email within each source.
  const value: MailchimpLeadCollections = { gravity: results.flat() }
  cache.set(cacheKey, { value, expiresAt: Date.now() + TAG_CACHE_MS })
  return inSpan(value, span)
}

function inSpan(value: MailchimpLeadCollections, span: { start: string; end: string }): MailchimpLeadCollections {
  const filter = <T extends { day: string }>(entries: T[]) =>
    entries.filter((entry) => entry.day >= span.start && entry.day <= span.end)
  return { gravity: filter(value.gravity) }
}

function leadSourceOf(raw: string): 'gravity' | null {
  const name = raw.trim().toLowerCase().replace(/\s*-\s*/g, '-')
  return name === 'form-barehand learn' || name === 'form-learn barehand' ? 'gravity' : null
}

async function getLists(apiKey: string, serverPrefix: string): Promise<MailchimpList[]> {
  const body = await mailchimp(apiKey, serverPrefix, '/lists?count=1000&fields=lists.id,lists.name,total_items')
  return asRecords(body.lists).flatMap((row) => {
    const id = typeof row.id === 'string' ? row.id : ''
    const name = typeof row.name === 'string' ? row.name : ''
    return id ? [{ id, name }] : []
  })
}

/**
 * Only members who opted in during the span are read. The member list returns
 * tags as `{ id, name }` without `date_added`, so a Gravity Forms lead is
 * already dated by its opt-in day; filtering on that server-side gives the
 * same rows as scanning the whole audience, which ran past the function limit.
 */
async function getTaggedMembers(
  apiKey: string,
  serverPrefix: string,
  listId: string,
  span: { start: string; end: string },
): Promise<MailchimpLeadEntry[]> {
  const pageParams = (offset: number) => new URLSearchParams({
    count: String(PAGE_SIZE),
    offset: String(offset),
    fields: MEMBER_FIELDS,
    // Mailchimp's `since` is exclusive and timestamps are whole seconds, so
    // starting a second early keeps an opt-in at exactly midnight.
    since_timestamp_opt: `${shiftDay(span.start, -1)}T23:59:59+00:00`,
    before_timestamp_opt: `${shiftDay(span.end, 1)}T00:00:00+00:00`,
  })
  const path = `/lists/${encodeURIComponent(listId)}/members`
  const initial = await mailchimp(apiKey, serverPrefix, `${path}?${pageParams(0)}`)
  const total = Math.max(0, num(initial.total_items))
  const pages: MailchimpPage[] = [initial]
  const offsets = Array.from(
    { length: Math.ceil(total / PAGE_SIZE) - 1 },
    (_, index) => (index + 1) * PAGE_SIZE,
  )

  for (let i = 0; i < offsets.length; i += PAGE_CONCURRENCY) {
    const pageResults = await Promise.all(
      offsets.slice(i, i + PAGE_CONCURRENCY).map((offset) =>
        mailchimp(apiKey, serverPrefix, `${path}?${pageParams(offset)}`),
      ),
    )
    pages.push(...pageResults)
  }

  const gravity: MailchimpLeadEntry[] = []
  for (const page of pages) {
    for (const raw of asRecords(page.members)) {
      const email = typeof raw.email_address === 'string' ? raw.email_address.trim().toLowerCase() : ''
      if (!email) continue
      for (const tag of asRecords(raw.tags)) {
        const label = typeof tag.name === 'string' ? tag.name : ''
        const source = leadSourceOf(label)
        if (!source || tag.status === 'inactive') continue
        // Dated by opt-in, the field the request is filtered on; see above.
        const day = typeof raw.timestamp_opt === 'string' ? timestampDay(raw.timestamp_opt) : ''
        if (!day) continue
        gravity.push({
          id: typeof raw.id === 'string' ? raw.id : email,
          day,
          email,
          label: `${label} (Mailchimp · Raww Gym Tips)`,
          source,
        })
      }
    }
  }
  return gravity
}

function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

function timestampDay(value: string): string {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : ''
}

async function mailchimp(
  apiKey: string,
  serverPrefix: string,
  path: string,
): Promise<MailchimpPage> {
  const response = await fetch(`https://${serverPrefix}.api.mailchimp.com/3.0${path}`, {
    headers: {
      authorization: `Basic ${Buffer.from(`dashboard:${apiKey}`).toString('base64')}`,
      accept: 'application/json',
    },
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = isRecord(body) && typeof body.detail === 'string' ? body.detail : 'request failed'
    throw new Error(`Mailchimp lead-tag lookup failed (HTTP ${response.status}): ${message}`)
  }
  return isRecord(body) ? (body as MailchimpPage) : {}
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}
