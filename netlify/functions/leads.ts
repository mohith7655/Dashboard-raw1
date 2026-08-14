/**
 * Leads, read from the Google Sheet the Make.com automations write into.
 *
 * The sheet holds six tables worth having and one that only looks like it:
 * two lists of email signups, two lists of the orders those list members went
 * on to place, the Facebook lead-ads capture, and — not leads at all — a log
 * of post-purchase WhatsApp messages. Only the first five are read here.
 *
 * The pre-aggregated `Full-count` tab is deliberately not read. It carries the
 * same daily counts derived from the same rows, and a card that could quote
 * either would eventually quote the one that had drifted. Counting the rows is
 * one code path and cannot disagree with itself.
 */
import type {
  DateRange,
  LeadSourceKey,
  LeadReport,
  LeadSourceStats,
  LeadDayPoint,
  UniqueContactPoint,
  BreakdownGrain,
  LeadCampaign,
} from '../../src/lib/types'
import { LEAD_SOURCES } from '../../src/lib/types'
import { metric } from '../../src/lib/derive'
import { bucketStart } from '../../src/lib/revenueBreakdown'
import {
  json,
  readComparison,
  readRange,
  toErrorResponse,
} from '../lib/http'
import { googleAccessToken, googleJson } from '../lib/google'

const SOURCE = 'Leads'
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly'
const REMEDY = 'Run `npm run google:auth` to mint one that carries it.'
const HINT =
  'The leads sheet could not be read. Check LEADS_SHEET_ID names the spreadsheet and that the Google refresh token carries spreadsheets.readonly — `npm run google:auth` mints one that does. A sheet shared as "anyone with the link" is readable without it. Then click Retry.'

/**
 * Which tab feeds which source, and what each row means.
 *
 * Named by tab title rather than by `gid`. A gid is stable but invisible: it
 * cannot be checked against the sheet without opening the URL, and a config
 * naming `1678064710` tells the next reader nothing about which list broke.
 */
interface TabSpec {
  tab: string
  /** The numeric sheet id used by the public CSV export endpoint. */
  gid: string
  /** Header of the column holding the date the row is counted on. */
  dateColumn: string[]
  /** Header of the column holding the person, for de-duplication. */
  keyColumn: string[]
}

const SIGNUP_TABS: Record<'mailchimp' | 'flodesk', TabSpec> = {
  mailchimp: {
    tab: 'Mailchimp-Entries',
    gid: '433881393',
    dateColumn: ['date'],
    keyColumn: ['email'],
  },
  flodesk: {
    tab: 'Flodesk-Entries',
    gid: '1678064710',
    dateColumn: ['date'],
    keyColumn: ['email'],
  },
}

/**
 * Orders placed by people on each list.
 *
 * Counted on the order's own date, not the signup's: this answers "what did
 * the list sell this month", which is a different question from "who joined".
 */
const ORDER_TABS: Record<'mailchimp' | 'flodesk', TabSpec> = {
  mailchimp: {
    tab: 'Woo-mailchimp',
    gid: '915416997',
    dateColumn: ['order date', 'date'],
    keyColumn: ['order id'],
  },
  flodesk: {
    tab: 'Woo-flodesk',
    gid: '20827426',
    dateColumn: ['order date', 'date'],
    keyColumn: ['order id'],
  },
}

const FACEBOOK_TAB: TabSpec = {
  tab: 'Facebook leads',
  gid: '1215577569',
  dateColumn: ['date created', 'date'],
  // `Emai` in the sheet as written. Matched loosely below rather than corrected
  // upstream: the automation writing that header is not this code's to change,
  // and a connector that breaks on a typo being fixed is worse than one that
  // accepts both.
  keyColumn: ['email', 'emai'],
}

/**
 * Leads over the selected period, by source.
 *
 *   ?start=&end=[&compareStart=&compareEnd=|&compare=none]
 */
export default async function handler(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url)
    const range = readRange(url)
    const against = readComparison(url, range)
    // This dashboard is specifically connected to the Make.com sheet supplied
    // for its lead data. The environment variable remains an override, so the
    // source can be moved without a code change later.
    const sheetId = (
      process.env.LEADS_SHEET_ID ?? '1F91xtnwgpP9FcxGaTyFJxUBnAJ2SY9uJ3NhX1I23zA4'
    ).trim()

    const read = await sheetReader(sheetId)

    // Every tab in parallel. They are independent reads of one document, and
    // fetching them in series would make the tab count the latency.
    const [mailchimp, flodesk, mailchimpOrders, flodeskOrders, facebook] =
      await Promise.all([
        read(SIGNUP_TABS.mailchimp),
        read(SIGNUP_TABS.flodesk),
        read(ORDER_TABS.mailchimp),
        read(ORDER_TABS.flodesk),
        read(FACEBOOK_TAB),
      ])

    const sources: Record<LeadSourceKey, LeadSourceStats> = {
      mailchimp: statsFor(mailchimp, range, against),
      flodesk: statsFor(flodesk, range, against),
      facebook: statsFor(facebook, range, against),
    }
    // The two email automations can capture the same person. Keep their
    // per-source counts for attribution, but offer the dashboard one contact
    // total that can never count an address twice.
    const uniqueContacts = statsFor([...mailchimp, ...flodesk], range, against)

    const orders: Record<'mailchimp' | 'flodesk', LeadSourceStats> = {
      mailchimp: statsFor(mailchimpOrders, range, against),
      flodesk: statsFor(flodeskOrders, range, against),
    }

    /**
     * Of the people who signed up inside the period, how many have since
     * ordered — matched on email, against orders of any date.
     *
     * A cohort figure, not a ratio of two totals. Dividing this period's
     * orders by this period's signups would set one group of people against a
     * different group and call the result a conversion rate; most of those
     * orders are from people who joined months ago.
     */
    const converted = convertedFrom(
      [...mailchimp, ...flodesk],
      [...mailchimpOrders, ...flodeskOrders],
      range,
    )

    const report: LeadReport = {
      sources,
      orders,
      uniqueContacts,
      converted,
      series: seriesOf({ mailchimp, flodesk, facebook }, range),
      uniqueContactBuckets: {
        day: uniqueContactPointsOf([...mailchimp, ...flodesk], range, 'day'),
        week: uniqueContactPointsOf([...mailchimp, ...flodesk], range, 'week'),
        month: uniqueContactPointsOf([...mailchimp, ...flodesk], range, 'month'),
      },
      campaigns: campaignsIn(facebook, range),
      // Named so a stale automation cannot pass for a quiet week. The Facebook
      // tab in particular stops receiving rows whenever the Make scenario
      // behind it stops, and silence there is indistinguishable from no leads.
      lastSeen: {
        mailchimp: latestDay(mailchimp),
        flodesk: latestDay(flodesk),
        facebook: latestDay(facebook),
      },
    }

    return json(report)
  } catch (err) {
    return toErrorResponse(err, HINT)
  }
}

/* ------------------------------ Reading ------------------------------- */

/** One row of a tab, already dated and keyed. */
interface Row {
  /** `yyyy-MM-dd` in UTC, or empty where the cell would not parse. */
  day: string
  /** Lower-cased email or id, for de-duplication. Empty where absent. */
  key: string
  /** Everything else, by lower-cased header. */
  cells: Record<string, string>
}

/**
 * A reader bound to one spreadsheet.
 *
 * Two ways in, and the credentials decide which. With a refresh token carrying
 * the Sheets scope it goes through the API, which works on a private sheet.
 * Without one it falls back to the CSV export, which works only while the
 * sheet is shared to anyone with the link — the state it is in today, and one
 * worth leaving behind, since that link exposes every name and email on it to
 * anybody who has ever seen the URL.
 */
async function sheetReader(
  sheetId: string,
): Promise<(spec: TabSpec) => Promise<Row[]>> {
  const token = await sheetsToken()

  return async (spec: TabSpec): Promise<Row[]> => {
    const grid = token
      ? await viaApi(sheetId, spec.tab, token)
      : await viaCsv(sheetId, spec)
    return toRows(grid, spec)
  }
}

/** The access token, or null where no credential carries the Sheets scope. */
async function sheetsToken(): Promise<string | null> {
  const configured =
    process.env.LEADS_REFRESH_TOKEN ?? process.env.GA4_REFRESH_TOKEN
  if (!configured) return null

  try {
    return await googleAccessToken({
      source: SOURCE,
      scope: SCOPE,
      clientIdKeys: ['LEADS_CLIENT_ID', 'GA4_CLIENT_ID', 'GOOGLE_ADS_CLIENT_ID'],
      clientSecretKeys: [
        'LEADS_CLIENT_SECRET',
        'GA4_CLIENT_SECRET',
        'GOOGLE_ADS_CLIENT_SECRET',
      ],
      refreshTokenKeys: ['LEADS_REFRESH_TOKEN', 'GA4_REFRESH_TOKEN'],
      remedy: REMEDY,
    })
  } catch (err) {
    // A token that exists but does not carry the scope is the expected state
    // until `npm run google:auth` is re-run. Falling through to the public
    // export keeps the tab working meanwhile; a genuinely private sheet then
    // fails on the export instead, with its own message.
    if (err instanceof Error && err.message.includes('(SCOPE)')) return null
    throw err
  }
}

interface ValueRange {
  values?: unknown
}

async function viaApi(sheetId: string, tab: string, token: string): Promise<string[][]> {
  const body = await googleJson<ValueRange>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}` +
      `/values/${encodeURIComponent(tab)}?majorDimension=ROWS`,
    token,
    SOURCE,
  )
  if (!Array.isArray(body.values)) return []
  return body.values.map((row) =>
    Array.isArray(row) ? row.map((cell) => String(cell ?? '')) : [],
  )
}

/**
 * The Sheets export endpoint has a normal row-oriented CSV shape. The
 * visualisation endpoint looks convenient because it accepts a tab name, but
 * for this workbook it serialises columns as multi-line cells, which turns a
 * date column into one enormous header and makes every date-range count zero.
 */
async function viaCsv(sheetId: string, spec: TabSpec): Promise<string[][]> {
  const url =
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}` +
    `/export?format=csv&gid=${encodeURIComponent(spec.gid)}`
  const res = await fetch(url)
  const text = await res.text()

  // A sheet that is not public answers with the sign-in page, HTML and all,
  // under a 200. Named here rather than left to produce zero rows.
  if (!res.ok || text.trimStart().startsWith('<')) {
    throw new Error(
      `${SOURCE} API error (ACCESS): the sheet is not readable without credentials. ` +
        'Either share it to anyone with the link, or set a refresh token carrying ' +
        `${SCOPE} so it can be read privately.`,
    )
  }

  return parseCsv(text)
}

/**
 * CSV as Sheets writes it: quoted fields, doubled quotes inside them, and
 * newlines inside quotes — the WhatsApp message bodies are full of both.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      // `\r\n` is one break, not two.
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }

  if (field || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

/** Headers are compared lower-cased and trimmed; `Emai` and `Email ` both land. */
const normalise = (header: string): string => header.trim().toLowerCase()

function toRows(grid: string[][], spec: TabSpec): Row[] {
  if (grid.length === 0) return []

  const headers = grid[0].map(normalise)
  const indexOf = (candidates: string[]): number => {
    for (const candidate of candidates) {
      const found = headers.indexOf(candidate)
      if (found !== -1) return found
    }
    return -1
  }

  const dateAt = indexOf(spec.dateColumn)
  const keyAt = indexOf(spec.keyColumn)

  const rows: Row[] = []
  for (const raw of grid.slice(1)) {
    const day = dateAt === -1 ? '' : toDay(raw[dateAt] ?? '')
    if (!day) continue

    const cells: Record<string, string> = {}
    headers.forEach((header, i) => {
      if (header) cells[header] = (raw[i] ?? '').trim()
    })

    rows.push({
      day,
      key: keyAt === -1 ? '' : (raw[keyAt] ?? '').trim().toLowerCase(),
      cells,
    })
  }

  return rows
}

/**
 * The calendar day a cell falls on, `yyyy-MM-dd`, or empty.
 *
 * Two shapes appear in this sheet and both are handled: the ISO timestamps the
 * automations write, and the `M/D/YYYY` a person typed. The ISO ones are read
 * in UTC, which is what their trailing `Z` says they are — converting them to
 * a local day would move a late-evening signup into the next one.
 */
export function toDay(cell: string): string {
  const value = cell.trim()

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(value)
  if (us) {
    const month = us[1].padStart(2, '0')
    const day = us[2].padStart(2, '0')
    return `${us[3]}-${month}-${day}`
  }

  return ''
}

/* ----------------------------- Aggregating ---------------------------- */

const within = (day: string, range: DateRange): boolean =>
  day >= range.start && day <= range.end

/**
 * Distinct people in the window, not rows.
 *
 * The automations re-write a row when a record changes, so the same email
 * appears more than once — 158 WhatsApp rows carry 79 conversations. Counting
 * rows would report growth every time something was edited.
 */
function countIn(rows: Row[], range: DateRange): number {
  const seen = new Set<string>()
  let unkeyed = 0

  for (const row of rows) {
    if (!within(row.day, range)) continue
    // A row with no key cannot be told from another like it, so it counts once
    // on its own rather than collapsing every anonymous row into one.
    if (!row.key) unkeyed += 1
    else seen.add(row.key)
  }

  return seen.size + unkeyed
}

function statsFor(
  rows: Row[],
  range: DateRange,
  against: DateRange | null,
): LeadSourceStats {
  const current = countIn(rows, range)
  const previous = against ? countIn(rows, against) : null
  return { count: metric(current, deltaOf(current, previous), previous) }
}

/** Null rather than a jump from nothing, which says more about the base. */
function deltaOf(current: number, previous: number | null): number | null {
  if (previous === null || previous === 0) return null
  return ((current - previous) / previous) * 100
}

/**
 * Signups inside the window who have an order against their email, at any date.
 *
 * Deliberately not date-bounded on the order side: a lead who joined on the
 * last day of the period and ordered the next morning converted, and a window
 * that cut them out would report the most recent cohort as the worst one.
 */
function convertedFrom(
  signups: Row[],
  orders: Row[],
  range: DateRange,
): { signups: number; ordered: number } {
  const buyers = new Set<string>()
  for (const order of orders) {
    const email = order.cells['email id'] ?? order.cells.email ?? ''
    if (email) buyers.add(email.trim().toLowerCase())
  }

  const joined = new Set<string>()
  for (const row of signups) {
    if (within(row.day, range) && row.key) joined.add(row.key)
  }

  let ordered = 0
  for (const email of joined) if (buyers.has(email)) ordered += 1

  return { signups: joined.size, ordered }
}

/** A row per day of the period, so a chart never has to infer a gap. */
function seriesOf(
  bySource: Record<LeadSourceKey, Row[]>,
  range: DateRange,
): LeadDayPoint[] {
  const counts: Record<LeadSourceKey, Map<string, Set<string>>> = {
    mailchimp: new Map(),
    flodesk: new Map(),
    facebook: new Map(),
  }

  for (const source of LEAD_SOURCES) {
    for (const row of bySource[source]) {
      if (!within(row.day, range)) continue
      const day = counts[source].get(row.day) ?? new Set<string>()
      day.add(row.key || `${row.day}:${day.size}`)
      counts[source].set(row.day, day)
    }
  }

  const points: LeadDayPoint[] = []
  for (const day of eachDay(range)) {
    points.push({
      date: day,
      mailchimp: counts.mailchimp.get(day)?.size ?? 0,
      flodesk: counts.flodesk.get(day)?.size ?? 0,
      facebook: counts.facebook.get(day)?.size ?? 0,
    })
  }
  return points
}

/**
 * Exact unique contacts in each table bucket.
 *
 * The period total above de-duplicates across the entire window. Here the
 * same operation happens in each day, week or month before only its count
 * leaves the function, so the Revenue Breakdown can be regrouped without
 * turning a contact who appears twice into two people.
 */
function uniqueContactPointsOf(
  rows: Row[],
  range: DateRange,
  grain: BreakdownGrain,
): UniqueContactPoint[] {
  const counts = new Map<string, Set<string>>()
  const unkeyed = new Map<string, number>()

  for (const row of rows) {
    if (!within(row.day, range)) continue
    const bucket = bucketStart(row.day, grain)
    if (!row.key) {
      unkeyed.set(bucket, (unkeyed.get(bucket) ?? 0) + 1)
      continue
    }
    const seen = counts.get(bucket) ?? new Set<string>()
    seen.add(row.key)
    counts.set(bucket, seen)
  }

  return [...new Set([...counts.keys(), ...unkeyed.keys()])].sort().map((date) => ({
    date,
    contacts: (counts.get(date)?.size ?? 0) + (unkeyed.get(date) ?? 0),
  }))
}

function eachDay(range: DateRange): string[] {
  const days: string[] = []
  const end = Date.parse(`${range.end}T00:00:00Z`)
  let at = Date.parse(`${range.start}T00:00:00Z`)
  if (!Number.isFinite(at) || !Number.isFinite(end)) return days

  // Bounded so a mistyped range cannot spin here.
  while (at <= end && days.length < 400) {
    days.push(new Date(at).toISOString().slice(0, 10))
    at += 86_400_000
  }
  return days
}

/** Which lead-ads campaign produced the leads, largest first. */
function campaignsIn(rows: Row[], range: DateRange): LeadCampaign[] {
  const byName = new Map<string, Set<string>>()

  for (const row of rows) {
    if (!within(row.day, range)) continue
    const name = row.cells['campaign name'] || 'Unnamed campaign'
    const seen = byName.get(name) ?? new Set<string>()
    seen.add(row.key || `${row.day}:${seen.size}`)
    byName.set(name, seen)
  }

  return [...byName]
    .map(([name, seen]) => ({ name, leads: seen.size }))
    .sort((a, b) => b.leads - a.leads || a.name.localeCompare(b.name))
}

/** The most recent day any row was written for, across all time. */
function latestDay(rows: Row[]): string | null {
  let latest: string | null = null
  for (const row of rows) if (!latest || row.day > latest) latest = row.day
  return latest
}
