/**
 * When each Raww Gym Tips contact was given Make.com's "FB Lead- Ads" tag.
 *
 * Mailchimp's member list returns tags as `{ id, name }` without the date they
 * were added; only the per-contact tags endpoint carries `date_added`, at one
 * request per contact. With ~1,600 tagged contacts that is minutes of calls,
 * far past a page load, and the opt-in date is no stand-in: Make.com tags in
 * batches, and half the tagged contacts joined the audience weeks earlier.
 *
 * So a background function records each contact's tag date in Netlify Blobs
 * and the Leads function reads them from there. A tag date does not change once
 * set, so each contact is looked up once and every later refresh only reads
 * the contacts tagged since.
 */
import { createHash } from 'node:crypto'
import { getStore } from '@netlify/blobs'
import { asArray, isRecord, num } from './http'

const STORE = 'dashboard'
const KEY = 'fb-lead-ads-tag-dates'
const LIST_NAME = 'raww gym tips'
const TAG_NAMES = new Set(['fb lead-ads', 'fb-lead-ads'])
const PAGE_SIZE = 1000
// Mailchimp allows ten simultaneous connections per account; leave room for
// the dashboard's own Mailchimp and Leads reads running at the same time.
const CONCURRENCY = 3
const SAVE_EVERY = 100
const REQUEST_TIMEOUT_MS = 20_000
const RETRY_MS = 1000
const BACKOFF_MS = 3000
const STALE_MS = 60 * 60_000
/** No run lasts longer than a background function may. */
const RUNNING_MS = 15 * 60_000
/** Long enough for a new run to list the tag and make its first save. */
const JUST_STARTED_MS = 60_000
/** A live run saves every hundred contacts, well inside this. */
const PROGRESS_MS = 90_000

export interface FbLeadTagDates {
  /** When the last refresh finished, or null before the first one. */
  updatedAt: string | null
  /** When a refresh last started, so overlapping requests do not start another. */
  startedAt: string | null
  /** Email (lower case) → day the tag was added, `yyyy-MM-dd` in UTC. */
  dates: Record<string, string>
  /** Tagged contacts whose date has not been read yet. */
  pending: number
}

export async function readFbLeadTagDates(): Promise<FbLeadTagDates> {
  return normalise(await getStore(STORE).get(KEY, { type: 'json' }))
}

export async function writeFbLeadTagDates(value: FbLeadTagDates): Promise<void> {
  await getStore(STORE).setJSON(KEY, value)
}

/**
 * Whether a refresh is under way: one started moments ago, or one that is
 * still saving progress. A run that stopped saving has died, and does not
 * hold back the next one.
 */
export function runInProgress(value: FbLeadTagDates, now = Date.now()): boolean {
  const started = value.startedAt ? Date.parse(value.startedAt) : Number.NaN
  if (!Number.isFinite(started) || now - started >= RUNNING_MS) return false
  if (now - started < JUST_STARTED_MS) return true
  const updated = value.updatedAt ? Date.parse(value.updatedAt) : Number.NaN
  return Number.isFinite(updated) && updated >= started && now - updated < PROGRESS_MS
}

/** Whether the stored dates are worth refreshing and no refresh is already under way. */
export function needsRefresh(value: FbLeadTagDates, now = Date.now()): boolean {
  if (runInProgress(value, now)) return false
  const updated = value.updatedAt ? Date.parse(value.updatedAt) : Number.NaN
  return value.pending > 0 || !Number.isFinite(updated) || now - updated > STALE_MS
}

interface TagDateStore {
  read: () => Promise<FbLeadTagDates>
  write: (value: FbLeadTagDates) => Promise<void>
}

/**
 * Brings the stored dates up to date with the contacts carrying the tag now:
 * dates the newly tagged, drops anyone whose tag was removed, and saves as it
 * goes so a run cut off at `deadline` is not wasted.
 *
 * Every save first folds in what is stored, so two runs that overlap add to
 * each other's progress instead of the later one overwriting the earlier.
 */
export async function refreshFbLeadTagDates(
  apiKey: string,
  serverPrefix: string,
  startedAt: string,
  deadline: number,
  store: TagDateStore,
  log: (message: string) => void = () => {},
): Promise<FbLeadTagDates> {
  const began = Date.now()
  const call = (path: string) => mailchimp(apiKey, serverPrefix, path)
  const listId = await findList(call)
  const segmentId = await findTagSegment(call, listId)
  const tagged = await segmentEmails(call, listId, segmentId)
  const taggedSet = new Set(tagged)

  const dates: Record<string, string> = {}
  const absorb = (stored: FbLeadTagDates) => {
    for (const [email, day] of Object.entries(stored.dates)) {
      if (taggedSet.has(email) && !dates[email]) dates[email] = day
    }
  }
  absorb(await store.read())
  const pendingCount = () => tagged.filter((email) => !dates[email]).length
  const save = async (): Promise<FbLeadTagDates> => {
    absorb(await store.read())
    const value: FbLeadTagDates = {
      updatedAt: new Date().toISOString(),
      startedAt,
      dates: { ...dates },
      pending: pendingCount(),
    }
    await store.write(value)
    return value
  }

  const missing = tagged.filter((email) => !dates[email])
  log(`tagged ${tagged.length}, already dated ${tagged.length - missing.length}, to look up ${missing.length}`)

  let failures = 0
  let lastError = ''
  let sinceSave = 0
  for (let i = 0; i < missing.length && Date.now() < deadline; i += CONCURRENCY) {
    const batch = missing.slice(i, i + CONCURRENCY).filter((email) => !dates[email])
    const results = await Promise.all(batch.map((email) => tagDay(call, listId, email)))
    let batchFailures = 0
    batch.forEach((email, index) => {
      const result = results[index]
      if (result.day) dates[email] = result.day
      if (result.error) {
        batchFailures += 1
        lastError = result.error
      }
    })
    failures += batchFailures
    // A whole batch failing is Mailchimp pushing back (usually its
    // ten-connection limit); give it a moment rather than racing on.
    if (batch.length > 0 && batchFailures === batch.length) await pause(BACKOFF_MS)
    sinceSave += batch.length
    if (sinceSave >= SAVE_EVERY) {
      const saved = await save()
      sinceSave = 0
      log(`dated ${Object.keys(saved.dates).length}, pending ${saved.pending}, failures ${failures}, ${Date.now() - began}ms`)
    }
  }

  const next = await save()
  log(`done: dated ${Object.keys(next.dates).length}, pending ${next.pending}, failures ${failures}${lastError ? ` (last: ${lastError})` : ''}, ${Date.now() - began}ms`)
  return next
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type Call = (path: string) => Promise<Record<string, unknown>>

async function findList(call: Call): Promise<string> {
  const body = await call('/lists?count=1000&fields=lists.id,lists.name')
  const list = asArray(body.lists).filter(isRecord).find(
    (row) => typeof row.name === 'string' && row.name.trim().toLowerCase() === LIST_NAME,
  )
  if (!list || typeof list.id !== 'string') throw new Error('Mailchimp audience "Raww Gym Tips" was not found.')
  return list.id
}

async function findTagSegment(call: Call, listId: string): Promise<number> {
  const body = await call(
    `/lists/${encodeURIComponent(listId)}/segments?type=static&count=1000&fields=segments.id,segments.name`,
  )
  const segment = asArray(body.segments).filter(isRecord).find(
    (row) => typeof row.name === 'string' && TAG_NAMES.has(tagKey(row.name)),
  )
  if (!segment) throw new Error('Mailchimp tag "FB Lead- Ads" was not found in Raww Gym Tips.')
  return num(segment.id)
}

/** Every contact carrying the tag, whatever their subscription status. */
async function segmentEmails(call: Call, listId: string, segmentId: number): Promise<string[]> {
  const page = (offset: number) => call(
    `/lists/${encodeURIComponent(listId)}/segments/${segmentId}/members?${new URLSearchParams({
      count: String(PAGE_SIZE),
      offset: String(offset),
      include_unsubscribed: 'true',
      include_cleaned: 'true',
      include_transactional: 'true',
      fields: 'members.email_address,total_items',
    })}`,
  )
  const first = await page(0)
  const total = Math.max(0, num(first.total_items))
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, Math.ceil(total / PAGE_SIZE) - 1) }, (_, index) =>
      page((index + 1) * PAGE_SIZE),
    ),
  )
  const emails = new Set<string>()
  for (const body of [first, ...rest]) {
    for (const row of asArray(body.members).filter(isRecord)) {
      const email = typeof row.email_address === 'string' ? row.email_address.trim().toLowerCase() : ''
      if (email) emails.add(email)
    }
  }
  return [...emails]
}

/**
 * The day this contact was given the tag. A failed read is retried once; if it
 * fails again the contact stays pending and the next refresh tries again.
 */
async function tagDay(call: Call, listId: string, email: string): Promise<{ day: string; error: string }> {
  const hash = createHash('md5').update(email).digest('hex')
  const path = `/lists/${encodeURIComponent(listId)}/members/${hash}/tags?count=100`
  let body: Record<string, unknown>
  try {
    body = await call(path).catch(async () => {
      await pause(RETRY_MS)
      return call(path)
    })
  } catch (err) {
    return { day: '', error: err instanceof Error ? err.message : String(err) }
  }
  const tag = asArray(body.tags).filter(isRecord).find(
    (row) => typeof row.name === 'string' && TAG_NAMES.has(tagKey(row.name)),
  )
  const added = typeof tag?.date_added === 'string' ? Date.parse(tag.date_added) : Number.NaN
  return { day: Number.isFinite(added) ? new Date(added).toISOString().slice(0, 10) : '', error: '' }
}

/** "FB Lead- Ads" and "FB-Lead-Ads" read the same. */
function tagKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ')
}

async function mailchimp(apiKey: string, serverPrefix: string, path: string): Promise<Record<string, unknown>> {
  const response = await fetch(`https://${serverPrefix}.api.mailchimp.com/3.0${path}`, {
    headers: {
      authorization: `Basic ${Buffer.from(`dashboard:${apiKey}`).toString('base64')}`,
      accept: 'application/json',
    },
    // One stuck request would otherwise hold the whole run until it is killed.
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = isRecord(body) && typeof body.detail === 'string' ? body.detail : 'request failed'
    throw new Error(`Mailchimp FB Lead-Ads tag lookup failed (HTTP ${response.status}): ${message}`)
  }
  return isRecord(body) ? body : {}
}

function normalise(raw: unknown): FbLeadTagDates {
  const record = isRecord(raw) ? raw : {}
  const dates: Record<string, string> = {}
  if (isRecord(record.dates)) {
    for (const [email, day] of Object.entries(record.dates)) {
      if (typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)) dates[email] = day
    }
  }
  return {
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : null,
    startedAt: typeof record.startedAt === 'string' ? record.startedAt : null,
    dates,
    pending: Math.max(0, Math.round(num(record.pending))),
  }
}
