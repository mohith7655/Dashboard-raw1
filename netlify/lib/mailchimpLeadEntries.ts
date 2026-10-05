/** Gravity Forms and Make.com tagged contacts from the Raww Gym Tips audience. */
import { isRecord, num } from './http'

const PAGE_SIZE = 1000
const PAGE_CONCURRENCY = 8
const TAG_CACHE_MS = 5 * 60 * 1000

export interface MailchimpLeadEntry {
  id: string
  day: string
  email: string
  label: string
  source: 'gravity'
}

export interface MailchimpPushEntry {
  id: string
  day: string
  email: string
  label: string
  source: 'mailchimp-push'
}

export interface MailchimpLeadCollections {
  gravity: MailchimpLeadEntry[]
  makePush: MailchimpPushEntry[]
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
 * Read the Gravity Forms tag and Make.com's FB Lead-Ads tag from the Raww Gym
 * Tips audience. Meta submissions come from Meta directly; WooCommerce supplies
 * customer/order history. Customer and year tags are not lead sources.
 */
export async function fetchMailchimpLeadEntries(
  apiKey: string,
  serverPrefix: string,
  span: { start: string; end: string },
): Promise<MailchimpLeadCollections> {
  const cacheKey = serverPrefix
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return inSpan(cached.value, span)

  const lists = (await getLists(apiKey, serverPrefix)).filter(
    (list) => list.name.trim().toLowerCase() === 'raww gym tips',
  )
  const results: { gravity: MailchimpLeadEntry[]; makePush: MailchimpPushEntry[] }[] = []
  for (let i = 0; i < lists.length; i += PAGE_CONCURRENCY) {
    results.push(
      ...(await Promise.all(
        lists.slice(i, i + PAGE_CONCURRENCY).map((list) =>
          getTaggedMembers(apiKey, serverPrefix, list.id),
        ),
      )),
    )
  }

  // Keep each tag row for form/tag attribution. Dashboard totals and the daily
  // graph deduplicate by email within each source.
  const value: MailchimpLeadCollections = {
    gravity: results.flatMap((result) => result.gravity),
    makePush: results.flatMap((result) => result.makePush),
  }
  cache.set(cacheKey, { value, expiresAt: Date.now() + TAG_CACHE_MS })
  return inSpan(value, span)
}

function inSpan(value: MailchimpLeadCollections, span: { start: string; end: string }): MailchimpLeadCollections {
  const filter = <T extends { day: string }>(entries: T[]) =>
    entries.filter((entry) => entry.day >= span.start && entry.day <= span.end)
  return { gravity: filter(value.gravity), makePush: filter(value.makePush) }
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

async function getTaggedMembers(
  apiKey: string,
  serverPrefix: string,
  listId: string,
): Promise<{ gravity: MailchimpLeadEntry[]; makePush: MailchimpPushEntry[] }> {
  const first = new URLSearchParams({
    count: String(PAGE_SIZE),
    offset: '0',
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
          fields: 'members.id,members.email_address,members.timestamp_opt,members.tags,total_items',
        })
        return mailchimp(apiKey, serverPrefix, `${path}?${params}`)
      }),
    )
    pages.push(...pageResults)
  }

  const gravity: MailchimpLeadEntry[] = []
  const makePush: MailchimpPushEntry[] = []
  for (const page of pages) {
    for (const raw of asRecords(page.members)) {
      const email = typeof raw.email_address === 'string' ? raw.email_address.trim().toLowerCase() : ''
      if (!email) continue
      for (const tag of asRecords(raw.tags)) {
        const label = typeof tag.name === 'string' ? tag.name : ''
        const source = leadSourceOf(label)
        if (tag.status === 'inactive') continue
        // Prefer the tag-add date to the audience opt-in date. A contact may
        // have joined the list before being added by a Gravity Forms signup.
        const tagDay = typeof tag.date_added === 'string' ? timestampDay(tag.date_added) : ''
        const optInDay = typeof raw.timestamp_opt === 'string' ? timestampDay(raw.timestamp_opt) : ''
        const id = typeof raw.id === 'string' ? raw.id : email
        if (source) {
          // Existing audience members can be tagged later, so prefer the tag
          // event and fall back to their opt-in date for older tag records.
          const day = tagDay || optInDay
          if (!day) continue
          gravity.push({
            id,
            day,
            email,
            label: `${label} (Mailchimp · Raww Gym Tips)`,
            source,
          })
        } else if (isMakeFacebookLeadTag(label) && tagDay) {
          makePush.push({
            id,
            day: tagDay,
            email,
            label: 'FB Lead-Ads (Mailchimp · Raww Gym Tips)',
            source: 'mailchimp-push',
          })
        }
      }
    }
  }
  return { gravity, makePush }
}

function isMakeFacebookLeadTag(raw: string): boolean {
  const name = raw.trim().toLowerCase().replace(/\s*-\s*/g, '-')
  return name === 'fb-lead-ads'
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
