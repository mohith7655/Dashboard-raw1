/** Helpers for Meta Ads and instant-form lead retrieval. */
import { asArray, isRecord, num } from './http'

const GRAPH_VERSION = 'v21.0'

/** The Facebook page whose instant forms are the Meta lead source. */
export const META_LEAD_PAGE_ID = process.env.META_LEAD_PAGE_ID?.trim() || '213491158815011'
/** Submissions are counted on the page's own reporting day. */
export const META_LEAD_TIME_ZONE = process.env.META_LEAD_TIME_ZONE?.trim() || 'America/Los_Angeles'

/** One entry actually submitted through a Meta instant form. */
export interface MetaLeadEntry {
  id: string
  day: string
  email: string
  form: string
}

/**
 * Read the page's actual instant-form entries. Insights' aggregate `lead`
 * action also includes website pixel conversions, so it is not a safe source
 * for the dashboard's Meta-only lead count.
 */
export async function fetchMetaLeadEntries(
  pageId: string,
  userToken: string,
  timeZone: string,
  span: { start: string; end: string },
): Promise<MetaLeadEntry[]> {
  const pageParams = new URLSearchParams({
    fields: 'id,access_token',
    limit: '100',
    access_token: userToken,
  })
  const pages = await fetchAllPages(
    `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?${pageParams}`,
    5,
  )
  const page = pages.find((row) => String(row.id ?? '') === pageId)
  const pageToken = typeof page?.access_token === 'string' ? page.access_token : ''
  if (!pageToken) throw new Error('Meta could not provide a page token for lead retrieval.')

  const formParams = new URLSearchParams({
    fields: 'id,name',
    limit: '100',
    access_token: pageToken,
  })
  const forms = await fetchAllPages(
    `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/leadgen_forms?${formParams}`,
    5,
  )

  const byForm = await Promise.all(
    forms.map(async (form) => {
      const id = String(form.id ?? '')
      if (!id) return []

      const params = new URLSearchParams({
        fields: 'id,created_time,field_data',
        limit: '1000',
        access_token: pageToken,
        // Bound Meta's server-side scan to the selected days (plus a UTC-day
        // margin for the page's local reporting timezone). Exact local-day
        // filtering still happens below.
        filtering: JSON.stringify([
          { field: 'time_created', operator: 'GREATER_THAN', value: rangeFloor(span.start) },
          { field: 'time_created', operator: 'LESS_THAN', value: rangeCeiling(span.end) },
        ]),
      })
      const entries = await fetchAllPages(
        `https://graph.facebook.com/${GRAPH_VERSION}/${id}/leads?${params}`,
        40,
      )
      const name = typeof form.name === 'string' && form.name ? form.name : id

      return entries.flatMap((entry) => {
        const entryId = String(entry.id ?? '')
        const day = dayInTimeZone(String(entry.created_time ?? ''), timeZone)
        if (!entryId || !day || day < span.start || day > span.end) return []

        const emailField = asArray(entry.field_data)
          .filter(isRecord)
          .find((field) => String(field.name ?? '').toLowerCase().includes('email'))
        const values = asArray(emailField?.values)
        const email = (typeof values[0] === 'string' ? values[0] : '').trim().toLowerCase()
        return [{ id: entryId, day, email, form: name }]
      })
    }),
  )

  const seen = new Set<string>()
  return byForm.flat().filter((entry) => {
    if (seen.has(entry.id)) return false
    seen.add(entry.id)
    return true
  })
}

function rangeFloor(day: string): number {
  return Math.floor(Date.parse(`${day}T00:00:00Z`) / 1000) - 86_400
}

function rangeCeiling(day: string): number {
  return Math.floor(Date.parse(`${day}T00:00:00Z`) / 1000) + 2 * 86_400
}

function dayInTimeZone(iso: string, timeZone: string): string {
  const timestamp = Date.parse(iso)
  if (!Number.isFinite(timestamp)) return ''

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp))
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

/** Meta expects `act_<id>`; accept either form in the environment variable. */
export function normaliseAccountId(raw: string): string {
  return raw.startsWith('act_') ? raw : `act_${raw}`
}

/** Preserves Meta's own error code without exposing request credentials. */
export function readGraphError(body: unknown, status: number): string {
  if (isRecord(body) && isRecord(body.error)) {
    const { message, code } = body.error
    const text = typeof message === 'string' ? message : 'Unknown error'
    return `Facebook API error (${num(code) || status}): ${text}`
  }
  return `Facebook API error (${status}): request failed`
}

/** Meta pages with a cursor. */
export async function fetchAllPages(
  first: string,
  maxPages = 20,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  let url: string | undefined = first

  for (let page = 0; url && page < maxPages; page++) {
    const res = await fetch(url)
    const body: unknown = await res.json()
    if (!res.ok) throw new Error(readGraphError(body, res.status))
    if (!isRecord(body)) break

    rows.push(...asArray(body.data).filter(isRecord))
    const paging = isRecord(body.paging) ? body.paging : null
    url = paging && typeof paging.next === 'string' ? paging.next : undefined
  }

  return rows
}
