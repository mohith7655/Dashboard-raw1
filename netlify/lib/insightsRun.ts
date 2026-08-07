/**
 * One unattended report, start to finish.
 *
 * The browser builds its snapshot from the figures it is already displaying,
 * which is what makes a report describe exactly what is on screen. Nobody is
 * looking when this runs, so the connectors are read the only other way they
 * can be — over the site's own function endpoints, the same URLs the dashboard
 * calls — and fed through the same `buildSnapshot`. One builder for both, so a
 * scheduled report and a clicked one cannot describe the same period
 * differently.
 */
import type {
  AdsMetrics,
  DateRange,
  Ga4Report,
  InsightsReport,
  OperatingCost,
  ReportPeriod,
  SourceError,
  StoredInsightsReport,
  TrafficMetrics,
  WooMetrics,
} from '../../src/lib/types'
import { previousRange, rangeFromPreset } from '../../src/lib/dateRange'
import { buildSnapshot } from '../../src/lib/insightsSnapshot'
import { costLines } from '../../src/lib/operatingCosts'
import { resolveTimeZone, setStoreTimeZone } from '../../src/lib/timeZone'
import { isRecord } from './http'

/**
 * The deployment's own origin.
 *
 * `URL` is the production site; the deploy-specific names are fallbacks for a
 * context where it is absent. Empty when none is set, which the caller reports
 * rather than guessing at localhost.
 */
export function siteUrl(): string {
  const found =
    process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL || ''
  return found.replace(/\/+$/, '')
}

/** What `buildSnapshot` reads: the figures, or a stated reason there are none. */
interface Source<T> {
  data: T | undefined
  error: SourceError | null
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text()
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error(`${res.status} — the function did not return JSON`)
  }
}

/**
 * One connector, resolved to the same `{ data, error }` shape the adapters
 * produce in the browser.
 *
 * A failure is carried rather than thrown: a report written without Google Ads
 * is worth having as long as it says Google Ads is missing, which is exactly
 * what the snapshot does with a populated `error`.
 */
async function load<T>(url: string, source: string): Promise<Source<T>> {
  try {
    const res = await fetch(url)
    const body = await readBody(res)
    if (!res.ok) {
      const error = isRecord(body) && isRecord(body.error) ? body.error : {}
      const message = typeof error.message === 'string' ? error.message : `status ${res.status}`
      throw new Error(message)
    }
    return { data: body as T, error: null }
  } catch (err) {
    return {
      data: undefined,
      error: { source, message: err instanceof Error ? err.message : String(err) },
    }
  }
}

const params = (range: DateRange, against: DateRange, extra: Record<string, string> = {}) =>
  new URLSearchParams({
    start: range.start,
    end: range.end,
    compareStart: against.start,
    compareEnd: against.end,
    ...extra,
  }).toString()

/** The stored overhead list; an unreachable store costs the overheads, not the report. */
async function loadCosts(base: string): Promise<OperatingCost[]> {
  const res = await load<{ costs?: OperatingCost[] }>(
    `${base}/.netlify/functions/costs`,
    'Operating costs',
  )
  return res.data?.costs ?? []
}

/**
 * Reads every connector for `period`, has OpenAI write the report, and returns
 * it with the range it describes attached.
 *
 * The dates are resolved here rather than stored on the schedule: "last 7 days"
 * has to mean the seven before each run, and a stored pair of dates would have
 * every Monday describe the same week.
 */
export async function runScheduledReport(
  base: string,
  period: ReportPeriod,
): Promise<StoredInsightsReport> {
  // The store's calendar, so an overnight run lands on the same day the
  // dashboard would have called it. Set once here, as `main.tsx` does for the
  // browser; `rangeFromPreset` reads it downstream.
  setStoreTimeZone(resolveTimeZone(process.env))

  const range = rangeFromPreset(period)
  const against = previousRange(range)

  const [woo, meta, google, traffic, ga4, costs] = await Promise.all([
    load<WooMetrics>(`${base}/.netlify/functions/metorik?${params(range, against)}`, 'Metorik'),
    load<AdsMetrics>(`${base}/.netlify/functions/meta?${params(range, against)}`, 'Facebook Ads'),
    load<AdsMetrics>(
      `${base}/.netlify/functions/google-ads?${params(range, against)}`,
      'Google Ads',
    ),
    load<TrafficMetrics>(
      `${base}/.netlify/functions/metorik?${params(range, against, { resource: 'traffic' })}`,
      'Metorik',
    ),
    load<Ga4Report>(
      `${base}/.netlify/functions/ga4?${params(range, against, { dimension: 'country' })}`,
      'Google Analytics',
    ),
    loadCosts(base),
  ])

  // Nothing answered at all — a report written from six errors would say only
  // that the dashboard is broken, at the price of a model call.
  if (!woo.data && !meta.data && !google.data && !traffic.data && !ga4.data) {
    throw new Error(
      `No connector answered: ${woo.error?.message ?? 'unknown error'}`,
    )
  }

  const snapshot = buildSnapshot({
    range,
    woo,
    meta,
    google,
    traffic,
    ga4,
    costLines: costLines(costs, range),
  })

  const res = await fetch(`${base}/.netlify/functions/insights`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(snapshot),
  })
  const body = await readBody(res)
  if (!res.ok) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : {}
    throw new Error(
      typeof error.message === 'string' ? error.message : `Insights failed (${res.status})`,
    )
  }

  return { report: body as InsightsReport, range, trigger: 'scheduled' }
}
