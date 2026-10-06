import { denyWithoutSession, serviceHeaders } from '../lib/auth'
import { wooCredentials } from '../lib/woo'
import {
  claimWooOrderIndexRun,
  markWooOrderIndexRun,
  readWooOrderIndex,
  readWooOrderIndexRun,
  refreshWooOrderIndex,
  wooOrderRunInProgress,
  writeWooOrderIndex,
} from '../lib/wooOrderIndex'

/** Stops starting new reads with time to save before the fifteen-minute cap. */
const RUN_BUDGET_MS = 13 * 60_000

const log = (message: string) => console.log(`[woo-orders] ${message}`)

/**
 * Brings the stored WooCommerce order index up to date for the Leads tab.
 *
 * Started by the hourly `woo-orders-cron` and by the Leads function when the
 * index is stale. The first read of the whole history is ~1,800 pages, more
 * than one run's fifteen minutes, so a run that ends with the sweep unfinished
 * starts the next one itself rather than leaving it for the next hour.
 * The caller has to hold a session or the functions' own service pass.
 */
export default async function handler(request: Request): Promise<Response> {
  const denied = denyWithoutSession(request)
  if (denied) return denied

  const creds = wooCredentials()
  if (!creds) return new Response('WOO_STORE_URL, WOO_CONSUMER_KEY and WOO_CONSUMER_SECRET are not configured', { status: 202 })

  let continueSweep = false
  try {
    const { run, etag } = await readWooOrderIndexRun()
    // Two runs at once would double the load on the store for nothing.
    if (wooOrderRunInProgress(run)) {
      log('another refresh is in progress')
      return new Response('Already running', { status: 202 })
    }
    const startedAt = new Date().toISOString()
    if (!(await claimWooOrderIndexRun(etag, startedAt))) {
      log('another refresh started first')
      return new Response('Already running', { status: 202 })
    }

    try {
      const index = await readWooOrderIndex()
      const fromPage = index.sweep?.nextPage ?? 0
      log(index.modifiedAfter
        ? `catching up from ${index.modifiedAfter}`
        : `sweeping from page ${index.sweep?.nextPage ?? 1}`)
      const next = await refreshWooOrderIndex(
        creds,
        index,
        Date.now() + RUN_BUDGET_MS,
        async (value) => {
          await writeWooOrderIndex(value)
          await markWooOrderIndexRun(startedAt, false)
        },
        log,
      )
      // Only when this run moved it on, so a sweep that keeps failing waits
      // for the hourly start instead of looping.
      continueSweep = next.sweep !== null && next.sweep.nextPage > fromPage
    } finally {
      await markWooOrderIndexRun(startedAt, true)
    }
  } catch (err) {
    console.error('[woo-orders] refresh failed:', err instanceof Error ? err.message : err)
  }

  if (continueSweep) {
    await fetch(`${new URL(request.url).origin}/.netlify/functions/woo-orders-background`, {
      method: 'POST',
      headers: serviceHeaders(),
    }).catch(() => {
      /* The hourly cron carries on from where this run stopped. */
    })
  }
  return new Response('Done', { status: 202 })
}
