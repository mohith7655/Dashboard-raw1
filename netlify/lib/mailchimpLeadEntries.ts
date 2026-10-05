/** Meta and Gravity Forms contacts classified by their Mailchimp source tags. */
import { isRecord, num } from './http'

const PAGE_SIZE = 1000
const PAGE_CONCURRENCY = 4
const TAG_CACHE_MS = 5 * 60 * 1000

export interface MailchimpLeadEntry {
  id: string
  day: string
  email: string
  label: string
  source: 'gravity'
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

const cache = new Map<string, { expiresAt: number; value: MailchimpLeadEntry[] }>()

/**
 * Read Mailchimp contacts tagged as Gravity Forms leads. Meta submissions come
 * directly from Meta, since Mailchimp tag/opt-in dates do not represent the
 * actual ad lead submission date. Customer tags are excluded from leads.
 */
export async function fetchMailchimpLeadEntries(
  apiKey: string,
  serverPrefix: string,
  span: { start: string; end: string },
): Promise<MailchimpLeadEntry[]> {
  const cacheKey = `${serverPrefix}:${span.start}:${span.end}`
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  const lists = await getLists(apiKey, serverPrefix)
  const results: MailchimpLeadEntry[][] = []
  for (let i = 0; i < lists.length; i += PAGE_CONCURRENCY) {
    results.push(
      ...(await Promise.all(
        lists.slice(i, i + PAGE_CONCURRENCY).map((list) =>
          getTaggedMembers(apiKey, serverPrefix, list.id, span),
        ),
      )),
    )
  }

  // Keep each tag row for form/tag attribution. Dashboard totals and the daily
  // graph deduplicate by email within each source.
  const value = results.flat()
  cache.set(cacheKey, { value, expiresAt: Date.now() + TAG_CACHE_MS })
  return value
}

function leadSourceOf(raw: string): 'gravity' | null {
  const name = raw.trim().toLowerCase()
  if (/^form(?:\s|$)/.test(name) || name === 'gforms_site') return 'gravity'
  return null
}

async function getLists(apiKey: string, serverPrefix: string): Promise<MailchimpList[]> {
  const body = await mailchimp(apiKey, serverPrefix, '/lists?count=1000&fields=lists.id,lists.name,total_items')
  return asRecords(body.lists).flatMap((row) => {
    const id = typeof row.id === 'string' ? row.id : ''
    const name = typeof row.name === 'string' ? row.name : ''
    return id ? [{ id, name }] : []
  })
}

async function getTaggedMembers(
  apiKey: string,
  serverPrefix: string,
  listId: string,
  span: { start: string; end: string },
): Promise<MailchimpLeadEntry[]> {
  const since = `${span.start}T00:00:00Z`
  const before = `${addOneDay(span.end)}T00:00:00Z`
  const first = new URLSearchParams({
    count: String(PAGE_SIZE),
    offset: '0',
    since_timestamp_opt: since,
    before_timestamp_opt: before,
    fields: 'members.id,members.email_address,members.timestamp_opt,members.tags,total_items',
  })
  const path = `/lists/${encodeURIComponent(listId)}/members`
  const initial = await mailchimp(apiKey, serverPrefix, `${path}?${first}`)
  const total = Math.max(0, num(initial.total_items))
  const pages: MailchimpPage[] = [initial]
  const offsets = Array.from(
    { length: Math.ceil(total / PAGE_SIZE) - 1 },
    (_, index) => (index + 1) * PAGE_SIZE,
  )

  for (let i = 0; i < offsets.length; i += PAGE_CONCURRENCY) {
    const pageResults = await Promise.all(
      offsets.slice(i, i + PAGE_CONCURRENCY).map((offset) => {
        const params = new URLSearchParams({
          count: String(PAGE_SIZE),
          offset: String(offset),
          since_timestamp_opt: since,
          before_timestamp_opt: before,
          fields: 'members.id,members.email_address,members.timestamp_opt,members.tags,total_items',
        })
        return mailchimp(apiKey, serverPrefix, `${path}?${params}`)
      }),
    )
    pages.push(...pageResults)
  }

  const rows: MailchimpLeadEntry[] = []
  for (const page of pages) {
    for (const raw of asRecords(page.members)) {
      const email = typeof raw.email_address === 'string' ? raw.email_address.trim().toLowerCase() : ''
      const timestamp = typeof raw.timestamp_opt === 'string' ? raw.timestamp_opt : ''
      const day = timestampDay(timestamp)
      if (!email || !day || day < span.start || day > span.end) continue
      for (const tag of asRecords(raw.tags)) {
        const label = typeof tag.name === 'string' ? tag.name : ''
        const source = leadSourceOf(label)
        if (!source || tag.status === 'inactive') continue
        rows.push({
          id: typeof raw.id === 'string' ? raw.id : email,
          day,
          email,
          label,
          source,
        })
      }
    }
  }
  return rows
}

function timestampDay(value: string): string {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : ''
}

function addOneDay(day: string): string {
  const timestamp = Date.parse(`${day}T00:00:00Z`)
  return Number.isFinite(timestamp)
    ? new Date(timestamp + 86_400_000).toISOString().slice(0, 10)
    : day
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
