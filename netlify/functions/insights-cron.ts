import type { Config } from '@netlify/functions'
import { isDue } from '../../src/lib/insightsSchedule'
import { resolveTimeZone } from '../../src/lib/timeZone'
import { readAutomation, writeAutomation } from '../lib/insightsStore'
import { siteUrl } from '../lib/insightsRun'

/**
 * The hourly sweep that decides whether a report is owed.
 *
 * It does not write the report itself. A run reads five connectors and then
 * waits on a model call that takes twenty seconds on its own, and a scheduled
 * function is cut off at thirty — so this one only claims the slot and hands
 * the work to a background function, which is allowed fifteen minutes.
 *
 * Hourly rather than at the minute the operator picked: a schedule is a piece
 * of stored data and the platform's cron is a piece of deployed configuration,
 * so the sweep is fixed and the stored schedule decides what it does. The cost
 * of that is granularity — a report set for 08:30 is written in the 09:00
 * sweep. `isDue` fires on the first hour at or after the chosen time.
 *
 * Scheduled functions run on published production deploys only; nothing fires
 * on a deploy preview or under `netlify dev`.
 */
export default async function handler(): Promise<Response> {
  const automation = await readAutomation()
  const zone = resolveTimeZone(process.env) ?? 'UTC'

  if (!isDue(automation.schedule, automation.lastRunAt, zone)) {
    return new Response('Not due', { status: 200 })
  }

  const base = siteUrl()
  if (!base) {
    await writeAutomation({
      lastRunAt: new Date().toISOString(),
      lastError:
        'The site URL is not in the function environment, so the scheduled run had nothing to call.',
    })
    return new Response('No site URL', { status: 200 })
  }

  // The slot is claimed before the work is handed off, not after it succeeds.
  // A run that dies halfway would otherwise still read as owed, and the next
  // sweep would start it again — an hour later, and every hour after that,
  // each one paying for the model call that failed. One attempt a day, and
  // the reason it failed is on screen instead.
  await writeAutomation({ lastRunAt: new Date().toISOString(), lastError: null })

  // Returns 202 the moment Netlify accepts it; the work carries on without us.
  await fetch(`${base}/.netlify/functions/insights-run-background`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ trigger: 'schedule' }),
  })

  return new Response('Started', { status: 200 })
}

export const config: Config = {
  schedule: '@hourly',
}
