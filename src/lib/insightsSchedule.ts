/**
 * When an unattended report is due, and what it should cover.
 *
 * Shared by both runtimes on purpose: the browser draws "next run" from these
 * functions and the scheduled function decides whether to fire from the same
 * ones. Two implementations would eventually disagree, and the reader would
 * have no way to tell which of them was lying.
 *
 * Every judgement is made on the store's calendar rather than in UTC — see
 * `timeZone.ts` for why the dashboard has one calendar rather than the reader's.
 */
import type { InsightsSchedule, ReportFrequency, ReportPeriod } from './types'
import { MAX_DAY_OF_MONTH, REPORT_FREQUENCIES, REPORT_PERIODS } from './types'
import { isTimeZone } from './timeZone'

export const DEFAULT_SCHEDULE: InsightsSchedule = {
  enabled: false,
  frequency: 'weekly',
  time: '08:00',
  // Monday: a week's report is read at the start of the next one, not on the
  // Sunday it closed.
  weekday: 1,
  dayOfMonth: 1,
  period: 'last7',
}

export const WEEKDAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

export const FREQUENCY_LABELS: Record<ReportFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
}

export const PERIOD_LABELS: Record<ReportPeriod, string> = {
  yesterday: 'Yesterday',
  last7: 'Last 7 days',
  last30: 'Last 30 days',
  thisMonth: 'This month so far',
  lastMonth: 'Last month',
}

/* ------------------------- Reading a stored value ------------------------- */

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.find((a) => a === v) ?? fallback

/** Clamped into range rather than rejected: one impossible field should not cost the schedule. */
const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Math.trunc(Number(v))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/**
 * Anything stored or posted, read back as a schedule.
 *
 * Applied on the way out of the blob as well as into it: the value outlives
 * any given version of this code, and a half-formed schedule would decide when
 * money is spent on an OpenAI call.
 */
export function normaliseSchedule(raw: unknown): InsightsSchedule {
  if (!isRecord(raw)) return { ...DEFAULT_SCHEDULE }

  const time = typeof raw.time === 'string' && HH_MM.test(raw.time.trim())
    ? raw.time.trim()
    : DEFAULT_SCHEDULE.time

  return {
    enabled: raw.enabled === true,
    frequency: oneOf(raw.frequency, REPORT_FREQUENCIES, DEFAULT_SCHEDULE.frequency),
    time,
    weekday: clampInt(raw.weekday, 0, 6, DEFAULT_SCHEDULE.weekday),
    dayOfMonth: clampInt(raw.dayOfMonth, 1, MAX_DAY_OF_MONTH, DEFAULT_SCHEDULE.dayOfMonth),
    period: oneOf(raw.period, REPORT_PERIODS, DEFAULT_SCHEDULE.period),
  }
}

/* ---------------------------- Calendar reading ---------------------------- */

interface LocalMoment {
  /** `yyyy-MM-dd` on the store's calendar. */
  date: string
  /** `HH:mm` on it, 24-hour, so it compares against `schedule.time` as a string. */
  time: string
}

/**
 * The wall clock in `zone` at `at`.
 *
 * Read as calendar fields rather than converted to an instant: "every Monday at
 * 08:00" is a statement about a wall clock, and the instant it names moves an
 * hour twice a year. Comparing fields is right across both changeovers without
 * any offset arithmetic.
 */
export function localMoment(zone: string, at: Date = new Date()): LocalMoment {
  const parts: Record<string, string> = {}
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: isTimeZone(zone) ? zone : 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    // Without this the midnight hour formats as `24`, which sorts after every
    // scheduled time and would fire a midnight schedule a day late.
    hourCycle: 'h23',
  })
  for (const part of formatter.formatToParts(at)) parts[part.type] = part.value
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  }
}

const addDaysIso = (iso: string, days: number): string =>
  new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10)

/** 0 = Sunday. Read off the calendar date, so it is the store's weekday. */
const weekdayOf = (iso: string): number => new Date(`${iso}T00:00:00Z`).getUTCDay()

const dayOfMonthOf = (iso: string): number => Number(iso.slice(8, 10))

/** Whether `date` is one of the days this schedule runs on, time aside. */
function fallsOn(schedule: InsightsSchedule, date: string): boolean {
  switch (schedule.frequency) {
    case 'daily':
      return true
    case 'weekly':
      return weekdayOf(date) === schedule.weekday
    case 'monthly':
      return dayOfMonthOf(date) === schedule.dayOfMonth
  }
}

/* -------------------------------- Dueness -------------------------------- */

/**
 * Whether a run is owed right now.
 *
 * At most one per calendar day, whatever the sweep interval: the check runs
 * hourly, every run costs an OpenAI call, and a schedule that fired on every
 * tick after its time had passed would spend a day's budget by lunchtime.
 *
 * `lastRunAt` is the last *attempt*, not the last success. A failing connector
 * would otherwise be retried every hour until it was fixed, each retry paying
 * for the model call that failed.
 */
export function isDue(
  schedule: InsightsSchedule,
  lastRunAt: string | null,
  zone: string,
  at: Date = new Date(),
): boolean {
  if (!schedule.enabled) return false

  const now = localMoment(zone, at)
  if (now.time < schedule.time) return false
  if (!fallsOn(schedule, now.date)) return false
  if (!lastRunAt) return true

  const last = new Date(lastRunAt)
  if (Number.isNaN(last.getTime())) return true
  return localMoment(zone, last).date < now.date
}

/**
 * The next slot the schedule will fire in, as store-calendar date and time, or
 * null when it is off.
 *
 * Today is offered only while its slot is still ahead and unclaimed. A schedule
 * that is already overdue reports the slot it missed rather than next week's —
 * it fires on the next sweep, and naming a date seven days out would read as
 * though nothing were coming.
 */
export function nextRun(
  schedule: InsightsSchedule,
  lastRunAt: string | null,
  zone: string,
  at: Date = new Date(),
): LocalMoment | null {
  if (!schedule.enabled) return null
  if (isDue(schedule, lastRunAt, zone, at)) {
    return { date: localMoment(zone, at).date, time: schedule.time }
  }

  const now = localMoment(zone, at)
  const ranToday = lastRunAt
    ? localMoment(zone, new Date(lastRunAt)).date === now.date
    : false
  const todayOpen = !ranToday && now.time < schedule.time

  // A monthly schedule can be up to 31 days out, and a weekly one 7; 40 covers
  // both with room rather than looping over a year to find a day that always
  // exists within the month.
  for (let ahead = todayOpen ? 0 : 1; ahead <= 40; ahead++) {
    const date = addDaysIso(now.date, ahead)
    if (fallsOn(schedule, date)) return { date, time: schedule.time }
  }
  return null
}

/** `Every Monday at 08:00` — the schedule as one line of English. */
export function describeSchedule(schedule: InsightsSchedule): string {
  const at = `at ${schedule.time}`
  switch (schedule.frequency) {
    case 'daily':
      return `Every day ${at}`
    case 'weekly':
      return `Every ${WEEKDAY_LABELS[schedule.weekday]} ${at}`
    case 'monthly':
      return `On the ${ordinal(schedule.dayOfMonth)} of each month ${at}`
  }
}

function ordinal(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return `${day}th`
  switch (day % 10) {
    case 1:
      return `${day}st`
    case 2:
      return `${day}nd`
    case 3:
      return `${day}rd`
    default:
      return `${day}th`
  }
}
