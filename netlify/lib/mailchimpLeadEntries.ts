/**
 * Raww Gym Tips contacts carrying a lead tag, read live from Mailchimp. The
 * whole list is kept by the `fbLeadTags` background refresh, since reading
 * all ~16,000 takes the better part of a minute; Leads reads only what
 * changed since that refresh, so an entry made minutes ago already counts.
 */
import { isRecord, num } from './http'
import { isGravityLeadTag, isMetaLeadTag, type LeadTagContact } from './fbLeadTags'

const PAGE_SIZE = 1000
// Mailchimp allows ten simultaneous connections per account, and the Mailchimp
// function opens six of its own while the Leads tab is loading.
const PAGE_CONCURRENCY = 4
const CACHE_MS = 60 * 1000
const MEMBER_FIELDS =
  'members.email_address,members.timestamp_signup,members.timestamp_opt,members.tags,members.merge_fields.ENTRYDATE,total_items'
const DAY = /^\d{4}-\d{2}-\d{2}$/

/** Which members to read: those changed since a moment, or those who opted in within a span. */
export type LeadContactFilter = { changedSince: string } | { optedIn: { start: string; end: string } }

interface MailchimpList {
  id: string
  name: string
}

interface MailchimpPage {
  total_items?: number
  lists?: unknown[]
  members?: unknown[]
}

const cache = new Map<string, { expiresAt: number; value: LeadTagContact[] }>()

/** One contact per lead tag on each matching member. Customer and year tags are not lead sources. */
export async function fetchLeadTagContacts(
  apiKey: string,
  serverPrefix: string,
  filter: LeadContactFilter,
): Promise<LeadTagContact[]> {
  const cacheKey = `${serverPrefix}:${JSON.stringify(filter)}`
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  const lists = (await getLists(apiKey, serverPrefix)).filter(
    (list) => list.name.trim().toLowerCase() === 'raww gym tips',
  )
  const contacts: LeadTagContact[] = []
  for (const list of lists) {
    contacts.push(...(await getMembers(apiKey, serverPrefix, list.id, filter)))
  }
  cache.set(cacheKey, { value: contacts, expiresAt: Date.now() + CACHE_MS })
  return contacts
}

async function getLists(apiKey: string, serverPrefix: string): Promise<MailchimpList[]> {
  const body = await mailchimp(apiKey, serverPrefix, '/lists?count=1000&fields=lists.id,lists.name,total_items')
  return asRecords(body.lists).flatMap((row) => {
    const id = typeof row.id === 'string' ? row.id : ''
    const name = typeof row.name === 'string' ? row.name : ''
    return id ? [{ id, name }] : []
  })
}

function filterParams(filter: LeadContactFilter): Record<string, string> {
  if ('changedSince' in filter) return { since_last_changed: filter.changedSince }
  // Mailchimp's `since` is exclusive and timestamps are whole seconds, so
  // starting a second early keeps an opt-in at exactly midnight.
  return {
    since_timestamp_opt: `${shiftDay(filter.optedIn.start, -1)}T23:59:59+00:00`,
    before_timestamp_opt: `${shiftDay(filter.optedIn.end, 1)}T00:00:00+00:00`,
  }
}

async function getMembers(
  apiKey: string,
  serverPrefix: string,
  listId: string,
  filter: LeadContactFilter,
): Promise<LeadTagContact[]> {
  const pageParams = (offset: number) => new URLSearchParams({
    count: String(PAGE_SIZE),
    offset: String(offset),
    fields: MEMBER_FIELDS,
    ...filterParams(filter),
  })
  const path = `/lists/${encodeURIComponent(listId)}/members`
  const initial = await mailchimp(apiKey, serverPrefix, `${path}?${pageParams(0)}`)
  const total = Math.max(0, num(initial.total_items))
  const pages: MailchimpPage[] = [initial]
  const offsets = Array.from(
    { length: Math.max(0, Math.ceil(total / PAGE_SIZE) - 1) },
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

  const contacts: LeadTagContact[] = []
  for (const page of pages) {
    for (const raw of asRecords(page.members)) {
      const email = typeof raw.email_address === 'string' ? raw.email_address.trim().toLowerCase() : ''
      if (!email) continue
      const entry = isRecord(raw.merge_fields) && typeof raw.merge_fields.ENTRYDATE === 'string'
        ? raw.merge_fields.ENTRYDATE.trim()
        : ''
      for (const tag of asRecords(raw.tags)) {
        const name = typeof tag.name === 'string' ? tag.name : ''
        if (tag.status === 'inactive' || !(isMetaLeadTag(name) || isGravityLeadTag(name))) continue
        contacts.push({
          email,
          tag: name,
          entryDay: DAY.test(entry) ? entry : '',
          signupDay: timestampDay(raw.timestamp_signup),
          optInDay: timestampDay(raw.timestamp_opt),
        })
      }
    }
  }
  return contacts
}

function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

function timestampDay(value: unknown): string {
  const timestamp = typeof value === 'string' && value ? Date.parse(value) : Number.NaN
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
