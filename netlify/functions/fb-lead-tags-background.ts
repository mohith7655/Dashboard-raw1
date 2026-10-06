import { denyWithoutSession } from '../lib/auth'
import { readFbLeadTagDates, refreshFbLeadTagDates, writeFbLeadTagDates } from '../lib/fbLeadTags'

/** Stops starting new lookups with time to save before the fifteen-minute cap. */
const RUN_BUDGET_MS = 13 * 60_000

/**
 * Dates newly tagged FB Lead-Ads contacts and stores them for the Leads tab.
 *
 * Started by the hourly `fb-lead-tags-cron` and by the Leads function when the
 * stored dates are stale. The `-background` suffix is what allows the time:
 * dating the whole tag from scratch is about four minutes of Mailchimp calls.
 * The caller has to hold a session or the functions' own service pass.
 */
export default async function handler(request: Request): Promise<Response> {
  const denied = denyWithoutSession(request)
  if (denied) return denied

  const key = process.env.MAILCHIMP_API_KEY?.trim()
  if (!key) return new Response('MAILCHIMP_API_KEY is not configured', { status: 202 })
  const prefix = process.env.MAILCHIMP_SERVER_PREFIX?.trim() || key.slice(key.lastIndexOf('-') + 1)

  try {
    const current = { ...(await readFbLeadTagDates()), startedAt: new Date().toISOString() }
    await writeFbLeadTagDates(current)
    await refreshFbLeadTagDates(key, prefix, current, Date.now() + RUN_BUDGET_MS, writeFbLeadTagDates)
  } catch (err) {
    console.error('FB Lead-Ads tag refresh failed:', err instanceof Error ? err.message : err)
  }
  return new Response('Done', { status: 202 })
}
