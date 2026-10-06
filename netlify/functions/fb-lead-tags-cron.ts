import type { Config } from '@netlify/functions'
import { serviceHeaders } from '../lib/auth'
import { siteUrl } from '../lib/insightsRun'

/**
 * Hourly nudge that keeps the stored FB Lead-Ads tag dates current while
 * nobody has the dashboard open. A scheduled function is cut off at thirty
 * seconds, so the work itself is handed to the background function.
 *
 * Scheduled functions run on published production deploys only.
 */
export default async function handler(): Promise<Response> {
  const base = siteUrl()
  if (!base) return new Response('No site URL', { status: 200 })

  // Returns 202 the moment Netlify accepts it; the work carries on without us.
  await fetch(`${base}/.netlify/functions/fb-lead-tags-background`, {
    method: 'POST',
    headers: serviceHeaders(),
  })
  return new Response('Started', { status: 200 })
}

export const config: Config = {
  schedule: '@hourly',
}
