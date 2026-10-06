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
  const pageCache = new Map<number, FlodeskPage>([[1, first]])
  const getPage = async (page: number): Promise<FlodeskPage> => {
    const cachedPage = pageCache.get(page)
    if (cachedPage) return cachedPage
    const value = await getSubscribers(apiKey, segment.id, page)
    pageCache.set(page, value)
    return value
  }

  let fullScan = false
  if (pageCount) {
    const last = pageCount === 1 ? first : await getPage(pageCount)
    if (!newestFirst(first) || !newestFirst(last)) {
      fullScan = true
    } else {
      try {
        const firstPage = await firstOverlappingPage(getPage, pageCount, span.end)
        const lastPage = await lastOverlappingPage(getPage, pageCount, span.start)
        if (firstPage <= lastPage) {
          const pageNumbers = Array.from(
            { length: lastPage - firstPage + 1 },
            (_, index) => firstPage + index,
          )
          for (let offset = 0; offset < pageNumbers.length; offset += PAGE_CONCURRENCY) {
            await Promise.all(pageNumbers.slice(offset, offset + PAGE_CONCURRENCY).map(getPage))
          }
        }
      } catch {
        // Preserve correctness if Flodesk's ordering changes during the lookup.
        fullScan = true
      }
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
  for (const response of pageCache.values()) {
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
  const days = pageDays(page)
  for (let index = 1; index < days.length; index += 1) {
    if (!days[index - 1] || !days[index] || days[index - 1] < days[index]) return false
  }
  return days.length > 0
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
    const oldest = pageDays(page).at(-1)?.slice(0, 10) ?? ''
    if (oldest && oldest <= end) {
      found = middle
      high = middle - 1
    } else {
      low = middle + 1
    }
  }
  return found
}

async function lastOverlappingPage(
  getPage: (page: number) => Promise<FlodeskPage>,
  pageCount: number,
  start: string,
): Promise<number> {
  let low = 1
  let high = pageCount
  let found = 0
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const page = await getPage(middle)
    if (!newestFirst(page)) throw new Error('Flodesk subscriber ordering changed during the date lookup.')
    const newest = pageDays(page)[0]?.slice(0, 10) ?? ''
    if (newest && newest >= start) {
      found = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return found
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
