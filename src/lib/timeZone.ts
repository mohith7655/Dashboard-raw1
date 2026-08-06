/**
 * Which calendar the dashboard's dates belong to.
 *
 * Not the viewer's. Two people opening the same dashboard an ocean apart were
 * offered different last-selectable days, and the one further west could not
 * pick a day the other could already see — a date range has to mean the same
 * thing to everyone looking at it, and the store's own day is the only calendar
 * the orders are filed under.
 *
 * Read from the environment so it can be set once for the whole deployment,
 * under whichever of these names the host happens to use. `TZ` is checked last
 * deliberately: some build images set it to UTC by default, and it would
 * otherwise mask a zone named explicitly.
 */
export const TIME_ZONE_ENV_KEYS = [
  'STORE_TIMEZONE',
  'STORE_TIME_ZONE',
  'STORE_TZ',
  'DASHBOARD_TIMEZONE',
  'VITE_STORE_TIMEZONE',
  'TIMEZONE',
  'TZ',
] as const

/** Whether the runtime recognises this as an IANA zone. */
export function isTimeZone(zone: string): boolean {
  if (!zone) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/**
 * The first recognised zone named in the environment, or null.
 *
 * A name that is set but not a real zone is skipped rather than thrown on: a
 * typo in a dashboard variable should cost the right calendar, not the whole
 * page.
 */
export function resolveTimeZone(
  env: Record<string, string | undefined>,
): string | null {
  for (const key of TIME_ZONE_ENV_KEYS) {
    const value = (env[key] ?? '').trim()
    if (value && isTimeZone(value)) return value
  }
  return null
}

let active = 'UTC'

/**
 * The zone every date on the dashboard is resolved against.
 *
 * Held here rather than read where it is needed, because the two runtimes get
 * at it differently — the browser has it substituted at build time, a function
 * reads its own environment — and `dateRange.ts` is compiled into both. Each
 * entry point sets it once on the way in; everything downstream just asks.
 */
export const storeTimeZone = (): string => active

/** Ignores anything the runtime does not recognise, leaving the zone as it was. */
export function setStoreTimeZone(zone: string | null | undefined): void {
  if (zone && isTimeZone(zone)) active = zone
}

/**
 * `America/Los_Angeles` → `Los Angeles (PDT)`, for saying on screen which
 * calendar the dates are on.
 *
 * Worth stating outright. A dashboard read from three countries offers one set
 * of dates to all of them, and without a label the reader furthest from the
 * store has no way to tell a deliberate choice from a bug.
 */
export function timeZoneLabel(zone: string): string {
  if (!isTimeZone(zone) || zone === 'UTC') return 'UTC'
  const city = zone.split('/').pop()?.replace(/_/g, ' ') ?? zone

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    timeZoneName: 'short',
  }).formatToParts(new Date())
  const abbreviation = parts.find((part) => part.type === 'timeZoneName')?.value

  // A zone with no short name of its own formats as `GMT-7`, which says less
  // than the city already does.
  return abbreviation && !abbreviation.startsWith('GMT')
    ? `${city} (${abbreviation})`
    : city
}

/**
 * `2026-08-06` — the calendar date it is right now in `zone`.
 *
 * `en-CA` is asked for because it formats as `yyyy-MM-dd`, but the parts are
 * read individually rather than trusting that: the locale's separator is not
 * part of any specification worth relying on.
 */
export function todayIn(zone: string, now: Date = new Date()): string {
  const parts: Record<string, string> = {}
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: isTimeZone(zone) ? zone : 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  for (const part of formatter.formatToParts(now)) parts[part.type] = part.value
  return `${parts.year}-${parts.month}-${parts.day}`
}
