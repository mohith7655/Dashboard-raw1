/**
 * Where the schedule and the last report it wrote are kept.
 *
 * Netlify Blobs rather than a browser store: the point of a scheduled report is
 * that it is written while nobody is looking, so the settings have to be
 * readable by a function with no session, and the report it produces has to
 * survive until someone opens the dashboard to read it.
 */
import { getStore } from '@netlify/blobs'
import type {
  DateRange,
  InsightAction,
  InsightFinding,
  InsightsAutomation,
  InsightsReport,
  StoredInsightsReport,
} from '../../src/lib/types'
import { normaliseSchedule } from '../../src/lib/insightsSchedule'
import { asArray, isRecord } from './http'

const STORE = 'dashboard'
const KEY = 'insights-automation'

export const AUTOMATION_HINT =
  'The report schedule is stored on Netlify. If this keeps failing, confirm Blobs is enabled for the site.'

export async function readAutomation(): Promise<InsightsAutomation> {
  const raw = await getStore(STORE).get(KEY, { type: 'json' })
  return normaliseAutomation(raw)
}

/**
 * Writes the whole record back after folding `patch` into what is stored.
 *
 * Merged rather than replaced because two writers share the key: the browser
 * saves settings, the scheduled run saves a report and its outcome. A wholesale
 * write from either would erase the other's half.
 */
export async function writeAutomation(
  patch: Partial<InsightsAutomation>,
): Promise<InsightsAutomation> {
  const current = await readAutomation()
  const next: InsightsAutomation = { ...current, ...patch }
  await getStore(STORE).setJSON(KEY, next)
  return next
}

/**
 * Everything is re-validated on the way out as well as in. The blob outlives
 * any given version of this code, and a schedule read half-formed decides when
 * money is spent on a model call.
 */
export function normaliseAutomation(raw: unknown): InsightsAutomation {
  const record = isRecord(raw) ? raw : {}
  return {
    schedule: normaliseSchedule(record.schedule),
    latest: readStoredReport(record.latest),
    lastRunAt: readIsoInstant(record.lastRunAt),
    lastError: typeof record.lastError === 'string' && record.lastError
      ? record.lastError.slice(0, 500)
      : null,
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.find((a) => a === str(v).toLowerCase()) ?? fallback

const SEVERITIES = ['critical', 'warning', 'good'] as const
const LEVELS = ['high', 'medium', 'low'] as const

function readIsoInstant(raw: unknown): string | null {
  const value = str(raw)
  if (!value) return null
  return Number.isNaN(new Date(value).getTime()) ? null : value
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function readRange(raw: unknown): DateRange | null {
  if (!isRecord(raw)) return null
  const start = str(raw.start)
  const end = str(raw.end)
  if (!ISO_DATE.test(start) || !ISO_DATE.test(end)) return null
  return { start, end, preset: 'custom' }
}

/**
 * A stored report is dropped whole rather than patched when it is malformed:
 * a report is read as a statement about a period, and one missing its period
 * or its headline would be read as a statement about now.
 */
export function readStoredReport(raw: unknown): StoredInsightsReport | null {
  if (!isRecord(raw)) return null

  const range = readRange(raw.range)
  const report = readReport(raw.report)
  if (!range || !report) return null

  return {
    report,
    range,
    trigger: raw.trigger === 'manual' ? 'manual' : 'scheduled',
  }
}

function readReport(raw: unknown): InsightsReport | null {
  if (!isRecord(raw)) return null

  const headline = str(raw.headline)
  const generatedAt = readIsoInstant(raw.generatedAt)
  if (!headline || !generatedAt) return null

  const findings: InsightFinding[] = asArray(raw.findings)
    .filter(isRecord)
    .map((row) => ({
      title: str(row.title),
      detail: str(row.detail),
      severity: oneOf(row.severity, SEVERITIES, 'warning'),
      evidence: str(row.evidence),
    }))
    .filter((row) => row.title !== '')

  const actions: InsightAction[] = asArray(raw.actions)
    .filter(isRecord)
    .map((row) => ({
      title: str(row.title),
      detail: str(row.detail),
      impact: oneOf(row.impact, LEVELS, 'medium'),
      effort: oneOf(row.effort, LEVELS, 'medium'),
      metric: str(row.metric),
    }))
    .filter((row) => row.title !== '')

  return {
    headline,
    summary: str(raw.summary),
    findings,
    actions,
    model: str(raw.model) || 'unknown',
    generatedAt,
  }
}
