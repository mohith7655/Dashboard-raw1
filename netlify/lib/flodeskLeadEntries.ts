/** Gravity Forms contacts from the Learn Barehand Flodesk segment. */
import { asArray, isRecord } from './http'

const API = 'https://api.flodesk.com/v1'
const PAGE_SIZE = 100
const PAGE_CONCURRENCY = 6
const CACHE_MS = 5 * 60 * 1000
const SEGMENT_NAME = 'form-learn barehand'
const USER_AGENT = 'Rawwgear Dashboard (netlify-functions)'

export interface FlodeskLeadEntry {
  id: string
  day: string
  email: string
  label: string
  source: 'gravity'
}

interface FlodeskPage {
  meta?: unknown
  data?: unknown
}

const cache = new Map<string, { expiresAt: number; value: FlodeskLeadEntry[] }>()

/** Read the exact Learn Barehand segment, using subscriber creation day. */
export async function fetchFlodeskGravityEntries(
  apiKey: string,
  span: { start: string; end: string },
): Promise<FlodeskLeadEntry[]> {
  const cacheKey = `${span.start}:${span.end}`
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return inSpan(cached.value, span)

  const segments = await getSegments(apiKey)
  const segment = segments.find((row) => normalise(row.name) === SEGMENT_NAME)
  if (!segment) throw new Error('Flodesk segment "Form - Learn Barehand" was not found.')

  const first = await getSubscribers(apiKey, segment.id, 1)
  const total = isRecord(first.meta) ? Math.max(0, Number(first.meta.total_items) || 0) : 0
  const pageCount = Math.ceil(total / PAGE_SIZE)
  // Pending reads are shared so overlapping lookups never fetch a page twice;
  // a failed read is dropped so the full scan below can try it again.
  const pageCache = new Map<number, Promise<FlodeskPage>>([[1, Promise.resolve(first)]])
  const getPage = (page: number): Promise<FlodeskPage> => {
    let pending = pageCache.get(page)
    if (!pending) {
      pending = getSubscribers(apiKey, segment.id, page)
      pageCache.set(page, pending)
      pending.catch(() => pageCache.delete(page))
    }
    return pending
  }

  let fullScan = false
  if (pageCount) {
    // The last page only confirms the ordering end to end, so it is read
    // alongside the lookup rather than ahead of it.
    const last = getPage(pageCount)
    try {
      if (!newestFirst(first)) throw new Error('Flodesk subscribers are not newest first.')
      // Ranges ending recently start on page 1, which is already in hand.
      const firstPage = oldestDay(first) <= span.end
        ? 1
        : await firstOverlappingPage(getPage, pageCount, span.end)
      await readBackTo(getPage, firstPage, pageCount, span.start)
      if (!newestFirst(await last)) throw new Error('Flodesk subscribers are not newest first.')
    } catch {
      // Preserve correctness if Flodesk's ordering changes during the lookup.
      fullScan = true
    }
    if (fullScan) {
      for (let page = 2; page <= pageCount; page += PAGE_CONCURRENCY) {
        const batch = Array.from(
          { length: Math.min(PAGE_CONCURRENCY, pageCount - page + 1) },
          (_, index) => page + index,
        )
        await Promise.all(batch.map(getPage))
      }
    }
  }

  const rows: FlodeskLeadEntry[] = []
  for (const response of await Promise.all(pageCache.values())) {
    for (const row of asArray(response.data).filter(isRecord)) {
      const email = typeof row.email === 'string' ? row.email.trim().toLowerCase() : ''
      const timestamp = typeof row.created_at === 'string' ? row.created_at : ''
      const day = dayOf(timestamp)
      if (!email || !day || day < span.start || day > span.end) continue
      rows.push({
        id: typeof row.id === 'string' ? row.id : email,
        day,
        email,
        label: 'Form - Learn Barehand (Flodesk)',
        source: 'gravity',
      })
    }
  }

  cache.set(cacheKey, { value: rows, expiresAt: Date.now() + CACHE_MS })
  return inSpan(rows, span)
}

function pageDays(page: FlodeskPage): string[] {
  return asArray(page.data)
    .filter(isRecord)
    .map((row) => typeof row.created_at === 'string' ? row.created_at : '')
}

function newestFirst(page: FlodeskPage): boolean {
  // Compare instants, not text: Flodesk trims trailing zeros from the
  // fraction, so "…32.18Z" sorts after "…32.182Z" as a string.
  const times = pageDays(page).map((value) => Date.parse(value))
  for (let index = 1; index < times.length; index += 1) {
    if (!Number.isFinite(times[index - 1]) || !Number.isFinite(times[index]) || times[index - 1] < times[index]) {
      return false
    }
  }
  return times.length > 0 && Number.isFinite(times[0])
}

async function firstOverlappingPage(
  getPage: (page: number) => Promise<FlodeskPage>,
  pageCount: number,
  end: string,
): Promise<number> {
  let low = 1
  let high = pageCount
  let found = pageCount + 1
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const page = await getPage(middle)
    if (!newestFirst(page)) throw new Error('Flodesk subscriber ordering changed during the date lookup.')
    const oldest = oldestDay(page)
    if (oldest && oldest <= end) {
      found = middle
      high = middle - 1
    } else {
      low = middle + 1
    }
  }
  return found
}

/**
 * Read forward from `from` in parallel waves until a page reaches back past
 * `start`; every page after that one is older than the span.
 */
async function readBackTo(
  getPage: (page: number) => Promise<FlodeskPage>,
  from: number,
  pageCount: number,
  start: string,
): Promise<void> {
  for (let page = from; page <= pageCount; page += PAGE_CONCURRENCY) {
    const wave = await Promise.all(
      Array.from(
        { length: Math.min(PAGE_CONCURRENCY, pageCount - page + 1) },
        (_, index) => getPage(page + index),
      ),
    )
    if (!wave.every(newestFirst)) throw new Error('Flodesk subscriber ordering changed during the date lookup.')
    if (wave.some((response) => oldestDay(response) < start)) return
  }
}

function oldestDay(page: FlodeskPage): string {
  return pageDays(page).at(-1)?.slice(0, 10) ?? ''
}

function inSpan(entries: FlodeskLeadEntry[], span: { start: string; end: string }): FlodeskLeadEntry[] {
  return entries.filter((entry) => entry.day >= span.start && entry.day <= span.end)
}

async function getSegments(apiKey: string): Promise<Array<{ id: string; name: string }>> {
  const response = await request(apiKey, '/segments?per_page=100&page=1')
  return asArray(response.data).filter(isRecord).flatMap((row) => {
    const id = typeof row.id === 'string' ? row.id : ''
    const name = typeof row.name === 'string' ? row.name : ''
    return id && name ? [{ id, name }] : []
  })
}

function getSubscribers(apiKey: string, segmentId: string, page: number): Promise<FlodeskPage> {
  const params = new URLSearchParams({
    segment_id: segmentId,
    per_page: String(PAGE_SIZE),
    page: String(page),
  })
  return request(apiKey, `/subscribers?${params}`)
}

async function request(apiKey: string, path: string): Promise<FlodeskPage> {
  const response = await fetch(`${API}${path}`, {
    headers: {
      authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
      'user-agent': USER_AGENT,
      accept: 'application/json',
    },
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = isRecord(body) && typeof body.message === 'string' ? body.message : 'request failed'
    throw new Error(`Flodesk Gravity Forms lookup failed (HTTP ${response.status}): ${message}`)
  }
  return isRecord(body) ? (body as FlodeskPage) : {}
}

function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ')
}

function dayOf(value: string): string {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : ''
}
