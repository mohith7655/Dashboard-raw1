import { readAutomation, writeAutomation } from '../lib/insightsStore'
import { runScheduledReport, siteUrl } from '../lib/insightsRun'

/**
 * How recently the sweep must have claimed the slot for this to be the run it
 * asked for.
 *
 * Every function endpoint is reachable from the open internet, and this one
 * spends money each time it completes. Rather than add a shared secret to
 * configure and forget, the run insists on the state the sweep leaves behind:
 * a schedule that is switched on, and a claim stamped minutes ago. A stray
 * request outside that window does nothing.
 */
const CLAIM_WINDOW_MS = 5 * 60_000

/**
 * The unattended report itself, run where there is time to write it.
 *
 * Invoked by `insights-cron`, which has thirty seconds and needs fifteen
 * minutes' worth of headroom for five connectors and a model call. The name's
 * `-background` suffix is what buys that: Netlify answers the caller with 202
 * immediately and lets this carry on.
 */
export default async function handler(): Promise<Response> {
  const automation = await readAutomation()

  if (!automation.schedule.enabled) {
    return new Response('Schedule is off', { status: 202 })
  }

  const claimedAgo = automation.lastRunAt
    ? Date.now() - new Date(automation.lastRunAt).getTime()
    : Number.POSITIVE_INFINITY
  if (!(claimedAgo >= 0 && claimedAgo < CLAIM_WINDOW_MS)) {
    return new Response('No run was claimed', { status: 202 })
  }

  const base = siteUrl()
  if (!base) {
    await writeAutomation({
      lastError: 'The site URL is not in the function environment.',
    })
    return new Response('No site URL', { status: 202 })
  }

  try {
    const latest = await runScheduledReport(base, automation.schedule.period)
    // The report replaces whatever was there and clears the error with it:
    // both describe the same last run, and a stale error beside a fresh report
    // would read as the report having failed.
    await writeAutomation({ latest, lastError: null })
  } catch (err) {
    // Kept rather than logged only. The operator finds out a scheduled report
    // failed by opening a dashboard that has no new report on it, and the
    // reason has to be there beside the gap.
    await writeAutomation({
      lastError: err instanceof Error ? err.message : String(err),
    })
  }

  return new Response('Done', { status: 202 })
}
