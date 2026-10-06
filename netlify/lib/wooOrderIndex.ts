/**
 * Every paid WooCommerce order's billing email and day, kept in Netlify Blobs
 * so the Leads tab can tell which contacts have bought without asking the
 * store at page load.
 *
 * The store cannot answer "has this email ordered" quickly. It runs on the
 * legacy post tables with WooCommerce Analytics switched off, so the REST
 * API's only email filter is `search` — a LIKE scan of postmeta that takes
 * about seven seconds per address, minutes for one page of leads. Reading the
 * history in bulk costs far less per order: a hundred to a request.
 *
 * So a background function reads the whole history once, in pages, and every
 * later refresh re-reads only the orders modified since the one before. Orders
 * are kept by id, so a re-read or a status change lands on the same entry
 * instead of counting twice, and an order cancelled after the fact drops out.
 */
import { getStore } from '@netlify/blobs'
import { isRecord, num } from './http'
import { PAID_STATUSES, type WooCredentials } from './woo'

const STORE = 'dashboard'
// v2 sweeps newest first; the first deploy's oldest-first index is not reused.
const KEY = 'woo-order-index-v2'
/** Kept apart from the index so claiming a run does not rewrite megabytes of orders. */
const RUN_KEY = 'woo-order-index-v2-run'
const PAGE_SIZE = 100
/** Pages read at once. Each is a few seconds of the store's PHP; four leaves room for shoppers. */
const CONCURRENCY = 4
const REQUEST_TIMEOUT_MS = 60_000
const RETRY_MS = 2000
const BACKOFF_MS = 5000
/** Failed waves in a row before a run stops and leaves the rest to the next. */
const MAX_FAILURES = 5
const SAVE_EVERY_MS = 45_000
/**
 * How far back each refresh starts re-reading modified orders, to cover clock
 * drift between the store and Netlify and writes that land late. Reading an
 * order twice is harmless; missing one is not.
 */
const OVERLAP_MS = 15 * 60_000
const STALE_MS = 10 * 60_000
/** No run lasts longer than a background function may. */
const RUNNING_MS = 15 * 60_000
/** A live run saves every 45 seconds, well inside this. */
const PROGRESS_MS = 3 * 60_000
const DAY = /^\d{4}-\d{2}-\d{2}$/

const PAID = new Set(PAID_STATUSES.split(','))

export interface WooOrderIndex {
  /** When the index was last saved, or null before the first run. */
  updatedAt: string | null
  /**
   * The first full read of the history while it is under way: its frozen
   * upper bound (UTC) and the next page to read. Null before and after.
   */
  sweep: { before: string; nextPage: number; totalPages: number } | null
  /**
   * Once the sweep is done, orders modified after this moment (UTC) are
   * re-read by the next refresh. Null until then, which is what tells an
   * index still being built from a complete one.
   */
  modifiedAfter: string | null
  /** Order id → [billing email in lower case, `yyyy-MM-dd` in store time]. Paid orders only. */
  orders: Record<string, [string, string]>
}

/** The lock that keeps two runs from sweeping the store at once. */
export interface WooOrderIndexRun {
  startedAt: string | null
  /** The run's last save, so one that died stops holding the lock. */
  savedAt: string | null
  finishedAt: string | null
}

export interface OrderFact {
  orderCount: number
  firstOrderDate: string
  lastOrderDate: string
}

/** What the Leads function needs from the index: per-email facts and how complete they are. */
export interface WooOrderHistory {
  /** Whether the whole history has been read at least once. */
  ready: boolean
  /** Share of the first read done, 0–1; 1 once ready. */
  progress: number
  updatedAt: string | null
  /** Billing email (lower case) → its paid orders. */
  facts: Map<string, OrderFact>
  run: WooOrderIndexRun
}

const store = () => getStore(STORE)

export async function readWooOrderIndex(): Promise<WooOrderIndex> {
  return normaliseIndex(await store().get(KEY, { type: 'json' }))
}

export async function writeWooOrderIndex(index: WooOrderIndex): Promise<void> {
  await store().setJSON(KEY, index)
}

export async function readWooOrderIndexRun(): Promise<{ run: WooOrderIndexRun; etag: string | null }> {
  const result = await store().getWithMetadata(RUN_KEY, { type: 'json' })
  return { run: normaliseRun(result?.data), etag: result?.etag ?? null }
}

/**
 * Takes the lock for a run starting at `startedAt`. The write only lands if
 * the lock is unchanged since it was read, so of two runs that both found it
 * free, one wins and the other returns false.
 */
export async function claimWooOrderIndexRun(etag: string | null, startedAt: string): Promise<boolean> {
  const value: WooOrderIndexRun = { startedAt, savedAt: startedAt, finishedAt: null }
  const result = etag
    ? await store().setJSON(RUN_KEY, value, { onlyIfMatch: etag })
    : await store().setJSON(RUN_KEY, value, { onlyIfNew: true })
  return result.modified
}

/** Records a run's progress, or with `finished` releases the lock. */
export async function markWooOrderIndexRun(startedAt: string, finished: boolean): Promise<void> {
  const now = new Date().toISOString()
  const value: WooOrderIndexRun = { startedAt, savedAt: now, finishedAt: finished ? now : null }
  await store().setJSON(RUN_KEY, value)
}

/** Whether a run holds the lock: started recently, not finished, and still saving. */
export function wooOrderRunInProgress(run: WooOrderIndexRun, now = Date.now()): boolean {
  const started = run.startedAt ? Date.parse(run.startedAt) : Number.NaN
  if (!Number.isFinite(started) || now - started >= RUNNING_MS) return false
  const finished = run.finishedAt ? Date.parse(run.finishedAt) : Number.NaN
  if (Number.isFinite(finished) && finished >= started) return false
  const saved = run.savedAt ? Date.parse(run.savedAt) : started
  return Number.isFinite(saved) && now - saved < PROGRESS_MS
}

/** Whether the index is worth refreshing and no run is already under way. */
export function wooOrderHistoryNeedsRefresh(history: WooOrderHistory, now = Date.now()): boolean {
  if (wooOrderRunInProgress(history.run, now)) return false
  if (!history.ready) return true
  const updated = history.updatedAt ? Date.parse(history.updatedAt) : Number.NaN
  return !Number.isFinite(updated) || now - updated > STALE_MS
}

let cached: { etag: string; history: Omit<WooOrderHistory, 'run'> } | null = null

/**
 * The stored history as per-email facts. A warm function keeps the last copy
 * and only downloads the index again when its etag has changed, since it is
 * several megabytes and changes at most every few minutes.
 */
export async function readWooOrderHistory(): Promise<WooOrderHistory> {
  const [result, { run }] = await Promise.all([
    store().getWithMetadata(KEY, { type: 'json', etag: cached?.etag }),
    readWooOrderIndexRun(),
  ])
  if (result && result.data === null && cached && result.etag === cached.etag) {
    return { ...cached.history, run }
  }
  const index = normaliseIndex(result?.data)
  const history = {
    ready: index.modifiedAfter !== null,
    progress: progressOf(index),
    updatedAt: index.updatedAt,
    facts: factsByEmail(index.orders),
  }
  if (result?.etag) cached = { etag: result.etag, history }
  return { ...history, run }
}

function progressOf(index: WooOrderIndex): number {
  if (index.modifiedAfter !== null) return 1
  if (!index.sweep || index.sweep.totalPages <= 0) return 0
  return Math.min(1, Math.max(0, (index.sweep.nextPage - 1) / index.sweep.totalPages))
}

function factsByEmail(orders: WooOrderIndex['orders']): Map<string, OrderFact> {
  const facts = new Map<string, OrderFact>()
  for (const [email, day] of Object.values(orders)) {
    const fact = facts.get(email)
    if (!fact) {
      facts.set(email, { orderCount: 1, firstOrderDate: day, lastOrderDate: day })
      continue
    }
    fact.orderCount += 1
    if (day < fact.firstOrderDate) fact.firstOrderDate = day
    if (day > fact.lastOrderDate) fact.lastOrderDate = day
  }
  return facts
}

/**
 * Carries the index forward from where it was left: the next stretch of the
 * first sweep while that is unfinished, then every order modified since the
 * last refresh. Stops starting new reads at `deadline`, and saves as it goes
 * so a run that is cut off is not wasted.
 */
export async function refreshWooOrderIndex(
  creds: WooCredentials,
  index: WooOrderIndex,
  deadline: number,
  save: (index: WooOrderIndex) => Promise<void>,
  log: (message: string) => void = () => {},
): Promise<WooOrderIndex> {
  let lastSave = Date.now()
  const saveNow = async () => {
    index.updatedAt = new Date().toISOString()
    await save(index)
    lastSave = Date.now()
  }
  const saveIfDue = async () => {
    if (Date.now() - lastSave >= SAVE_EVERY_MS) await saveNow()
  }

  if (index.modifiedAfter === null) await sweepHistory(creds, index, deadline, saveIfDue, log)
  if (index.modifiedAfter !== null && Date.now() < deadline) {
    try {
      await catchUp(creds, index, deadline, saveIfDue, log)
    } catch (err) {
      log(`catch-up stopped: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  await saveNow()
  log(`saved ${Object.keys(index.orders).length} paid orders${index.sweep ? `, sweep at page ${index.sweep.nextPage} of ${index.sweep.totalPages}` : ''}`)
  return index
}

/**
 * The first read of the whole history, newest order first. The leads on
 * screen are usually from the last few months, and their orders are on the
 * first few pages, so they are matched within a minute; the years before fill
 * in over the half hour the rest takes.
 *
 * Paged by number over a set frozen at the moment the sweep began, so new
 * orders do not shift the pages under it. Every status is read, not just paid
 * ones: an old order cancelled mid-sweep would otherwise leave the paid set
 * and slide its neighbour onto a page already read. Anything that changes
 * while the sweep runs is modified after it began, which is where the first
 * catch-up starts.
 */
async function sweepHistory(
  creds: WooCredentials,
  index: WooOrderIndex,
  deadline: number,
  saveIfDue: () => Promise<void>,
  log: (message: string) => void,
): Promise<void> {
  index.sweep ??= { before: utc(Date.now()), nextPage: 1, totalPages: 0 }
  let failures = 0
  while (index.sweep && Date.now() < deadline && failures < MAX_FAILURES) {
    const sweep = index.sweep
    const pages = Array.from({ length: CONCURRENCY }, (_, i) => sweep.nextPage + i)
      .filter((page) => sweep.totalPages === 0 || page <= sweep.totalPages)
    const results = await Promise.allSettled(pages.map((page) =>
      readOrders(creds, { before: sweep.before, orderby: 'id', order: 'desc', page: String(page) }),
    ))

    let reachedEnd = pages.length === 0
    let broken = false
    for (const [i, result] of results.entries()) {
      if (result.status === 'rejected') {
        if (!broken) log(`page ${pages[i]} failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`)
        broken = true
        continue
      }
      // Pages read past a failed one are kept too; reading them again is harmless.
      fold(index.orders, result.value.orders)
      if (result.value.totalPages > 0) sweep.totalPages = result.value.totalPages
      if (broken) continue
      sweep.nextPage = pages[i] + 1
      if (result.value.orders.length < PAGE_SIZE) reachedEnd = true
    }

    if (reachedEnd || (sweep.totalPages > 0 && sweep.nextPage > sweep.totalPages)) {
      index.sweep = null
      index.modifiedAfter = utc(Date.parse(`${sweep.before}Z`) - OVERLAP_MS)
      log(`sweep finished: ${Object.keys(index.orders).length} paid orders`)
      return
    }
    if (broken) {
      failures += 1
      await pause(BACKOFF_MS)
    } else {
      failures = 0
    }
    await saveIfDue()
  }
}

/** Every order modified since the last refresh, oldest change first. */
async function catchUp(
  creds: WooCredentials,
  index: WooOrderIndex,
  deadline: number,
  saveIfDue: () => Promise<void>,
  log: (message: string) => void,
): Promise<void> {
  const began = Date.now()
  let cursor = index.modifiedAfter ?? utc(began - OVERLAP_MS)
  let page = 1
  let read = 0
  while (Date.now() < deadline) {
    const { orders } = await readOrders(creds, { modified_after: cursor, orderby: 'modified', order: 'asc', page: String(page) })
    fold(index.orders, orders)
    read += orders.length
    if (orders.length < PAGE_SIZE) {
      index.modifiedAfter = utc(began - OVERLAP_MS)
      log(`caught up: ${read} modified orders read`)
      return
    }
    // Moves the cursor to this page's last change, a second short, so an
    // order sharing that second is read again rather than skipped. A full
    // page all within one second cannot move it, so the page number does.
    const last = Date.parse(`${String(orders[orders.length - 1].date_modified_gmt)}Z`)
    const next = Number.isFinite(last) ? utc(last - 1000) : cursor
    if (next > cursor) {
      cursor = next
      page = 1
    } else {
      page += 1
    }
    index.modifiedAfter = cursor
    await saveIfDue()
  }
}

/** Records each paid order under its billing email, and drops any that is no longer paid. */
function fold(orders: WooOrderIndex['orders'], rows: Record<string, unknown>[]): void {
  for (const row of rows) {
    const id = Math.round(num(row.id))
    if (id <= 0) continue
    const email = isRecord(row.billing) && typeof row.billing.email === 'string'
      ? row.billing.email.trim().toLowerCase()
      : ''
    const day = typeof row.date_created === 'string' ? row.date_created.slice(0, 10) : ''
    if (PAID.has(String(row.status)) && email && DAY.test(day)) orders[id] = [email, day]
    else delete orders[id]
  }
}

async function readOrders(
  creds: WooCredentials,
  params: Record<string, string>,
): Promise<{ orders: Record<string, unknown>[]; totalPages: number }> {
  try {
    return await requestOrders(creds, params)
  } catch {
    await pause(RETRY_MS)
    return requestOrders(creds, params)
  }
}

async function requestOrders(
  creds: WooCredentials,
  params: Record<string, string>,
): Promise<{ orders: Record<string, unknown>[]; totalPages: number }> {
  const query = new URLSearchParams({
    ...params,
    status: 'any',
    per_page: String(PAGE_SIZE),
    // `before`, `modified_after` and the cursor are all UTC.
    dates_are_gmt: 'true',
    _fields: 'id,status,date_created,date_modified_gmt,billing',
  })
  const auth = Buffer.from(`${creds.key}:${creds.secret}`).toString('base64')
  const response = await fetch(`${creds.origin}/wp-json/wc/v3/orders?${query.toString()}`, {
    headers: { authorization: `Basic ${auth}`, accept: 'application/json' },
    // One stuck request would otherwise hold the whole run until it is killed.
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`WooCommerce API error (HTTP ${response.status}) reading orders`)
  const body: unknown = await response.json().catch(() => null)
  if (!Array.isArray(body)) throw new Error('WooCommerce returned something other than a list of orders')
  return {
    orders: body.filter(isRecord),
    totalPages: Math.max(0, Math.round(num(response.headers.get('x-wp-totalpages')))),
  }
}

/** `yyyy-MM-ddTHH:mm:ss` in UTC — the form Woo takes with `dates_are_gmt`. */
const utc = (ms: number): string => new Date(ms).toISOString().slice(0, 19)

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function normaliseIndex(raw: unknown): WooOrderIndex {
  const record = isRecord(raw) ? raw : {}
  const sweep = isRecord(record.sweep) && typeof record.sweep.before === 'string'
    ? {
        before: record.sweep.before,
        nextPage: Math.max(1, Math.round(num(record.sweep.nextPage))),
        totalPages: Math.max(0, Math.round(num(record.sweep.totalPages))),
      }
    : null
  const orders: WooOrderIndex['orders'] = {}
  if (isRecord(record.orders)) {
    for (const [id, entry] of Object.entries(record.orders)) {
      if (Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'string') {
        orders[id] = [entry[0], entry[1]]
      }
    }
  }
  return {
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : null,
    sweep,
    modifiedAfter: typeof record.modifiedAfter === 'string' ? record.modifiedAfter : null,
    orders,
  }
}

function normaliseRun(raw: unknown): WooOrderIndexRun {
  const record = isRecord(raw) ? raw : {}
  const text = (value: unknown) => (typeof value === 'string' ? value : null)
  return {
    startedAt: text(record.startedAt),
    savedAt: text(record.savedAt),
    finishedAt: text(record.finishedAt),
  }
}
