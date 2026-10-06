import { denyWithoutSession } from '../lib/auth'
import {
  readFbLeadTagDates,
  refreshFbLeadTagDates,
  runInProgress,
  writeFbLeadTagDates,
} from '../lib/fbLeadTags'

/** Stops starting new lookups with time to save before the fifteen-minute cap. */
const RUN_BUDGET_MS = 13 * 60_000

const log = (message: string) => console.log(`[fb-lead-tags] ${message}`)

/**
 * Dates newly tagged FB Lead-Ads contacts and stores them for the Leads tab.
 *
 * Started by the hourly `fb-lead-tags-cron` and by the Leads function when the
 * stored dates are stale. The `-background` suffix is what allows the time:
 * dating the whole tag from scratch is a few minutes of Mailchimp calls.
 * The caller has to hold a session or the functions' own service pass.
 */
export default async function handler(request: Request): Promise<Response> {
  const denied = denyWithoutSession(request)
  if (denied) return denied

  const key = process.env.MAILCHIMP_API_KEY?.trim()
  if (!key) return new Response('MAILCHIMP_API_KEY is not configured', { status: 202 })
  const prefix = process.env.MAILCHIMP_SERVER_PREFIX?.trim() || key.slice(key.lastIndexOf('-') + 1)

  try {
    const stored = await readFbLeadTagDates()
    // Two runs at once would split Mailchimp's ten connections between them.
    if (runInProgress(stored)) {
      log('another refresh is in progress')
      return new Response('Already running', { status: 202 })
    }
    const startedAt = new Date().toISOString()
    await writeFbLeadTagDates({ ...stored, startedAt })
    log(`started with ${Object.keys(stored.dates).length} dated`)
    await refreshFbLeadTagDates(
      key,
      prefix,
      startedAt,
      Date.now() + RUN_BUDGET_MS,
      { read: readFbLeadTagDates, write: writeFbLeadTagDates },
      log,
    )
  } catch (err) {
    console.error('[fb-lead-tags] refresh failed:', err instanceof Error ? err.message : err)
  }
  return new Response('Done', { status: 202 })
}
