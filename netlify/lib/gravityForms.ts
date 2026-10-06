/**
 * Lead form entries read from Gravity Forms itself, through its REST API.
 *
 * Form 62, the Barehand popup, replaced the Learn Barehand form on 3 October
 * 2026. Make.com still watches the old form, so the popup's entries reach
 * neither Mailchimp nor the log sheet; they are read here, straight from the
 * form, each on the day it was submitted.
 */
import { isRecord, num } from './http'

const PAGE_SIZE = 500
/** A safety valve: 20,000 entries in one range is far past any real one. */
const MAX_PAGES = 40
const CACHE_MS = 2 * 60_000
const FORM_CACHE_MS = 60 * 60_000
const REQUEST_TIMEOUT_MS = 20_000

export interface FormEntry {
  email: string
  /** The submission day in UTC, as Gravity Forms stores `date_created`. */
  day: string
  /** The form's title without its date prefix, e.g. `Barehand popup (3-step)`. */
  form: string
}

interface Credentials {
  origin: string
  auth: string
  formIds: string[]
}

/**
 * Present only when the key pair is set. The site is the store's own
 * WordPress, so its address is WOO_STORE_URL's.
 */
export function gravityFormsCredentials(): Credentials | null {
  const origin = (process.env.GRAVITY_FORMS_URL ?? process.env.WOO_STORE_URL ?? '').trim().replace(/\/+$/, '')
  const key = (process.env.GRAVITY_FORMS_KEY ?? '').trim()
  const secret = (process.env.GRAVITY_FORMS_SECRET ?? '').trim()
  const formIds = (process.env.GRAVITY_FORMS_LEAD_FORMS ?? '62').split(',').map((id) => id.trim()).filter(Boolean)
  if (!origin || !key || !secret || formIds.length === 0) return null
  return { origin, auth: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`, formIds }
}

const entryCache = new Map<string, { expiresAt: number; value: FormEntry[] }>()
const formCache = new Map<string, { expiresAt: number; value: { title: string; emailField: string } }>()

/** Every active entry of the lead forms submitted within the span. */
export async function fetchFormEntries(
  creds: Credentials,
  span: { start: string; end: string },
): Promise<FormEntry[]> {
  const cacheKey = `${creds.formIds.join(',')}:${span.start}:${span.end}`
  const cached = entryCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  const value = (await Promise.all(creds.formIds.map((id) => formEntries(creds, id, span)))).flat()
  entryCache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_MS })
  return value
}

async function formEntries(creds: Credentials, formId: string, span: { start: string; end: string }): Promise<FormEntry[]> {
  const form = await formShape(creds, formId)
  // Gravity Forms reads these dates in the site's time zone; a day either
  // side covers that, and the UTC day is checked below.
  const search = JSON.stringify({ status: 'active', start_date: shiftDay(span.start, -1), end_date: shiftDay(span.end, 1) })
  const entries: FormEntry[] = []
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const params = new URLSearchParams({
      search,
      'paging[page_size]': String(PAGE_SIZE),
      'paging[current_page]': String(page),
    })
    const body = await gravityForms(creds, `/forms/${encodeURIComponent(formId)}/entries?${params}`)
    const rows = isRecord(body) && Array.isArray(body.entries) ? body.entries.filter(isRecord) : []
    for (const row of rows) {
      const email = typeof row[form.emailField] === 'string' ? String(row[form.emailField]).trim().toLowerCase() : ''
      const day = typeof row.date_created === 'string' ? row.date_created.slice(0, 10) : ''
      if (email && day >= span.start && day <= span.end) entries.push({ email, day, form: form.title })
    }
    if (rows.length < PAGE_SIZE) break
  }
  return entries
}

/** The form's title and which field holds the email, read once an hour. */
async function formShape(creds: Credentials, formId: string): Promise<{ title: string; emailField: string }> {
  const cached = formCache.get(formId)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  const body = await gravityForms(creds, `/forms/${encodeURIComponent(formId)}`)
  const record = isRecord(body) ? body : {}
  const fields = Array.isArray(record.fields) ? record.fields.filter(isRecord) : []
  const email = fields.find((field) => field.type === 'email')
  if (!email) throw new Error(`Gravity Forms form ${formId} has no email field.`)
  const title = typeof record.title === 'string' ? record.title : `Form ${formId}`
  const value = {
    // "2026_10_01- form- Barehand popup (3-step)" reads as "Barehand popup (3-step)".
    title: title.replace(/^\d{4}_\d{2}_\d{2}\s*-\s*(form\s*-\s*)?/i, '').trim() || title,
    emailField: String(num(email.id)),
  }
  formCache.set(formId, { value, expiresAt: Date.now() + FORM_CACHE_MS })
  return value
}

async function gravityForms(creds: Credentials, path: string): Promise<unknown> {
  const response = await fetch(`${creds.origin}/wp-json/gf/v2${path}`, {
    headers: { authorization: creds.auth, accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = isRecord(body) && typeof body.message === 'string' ? body.message.replace(/<[^>]+>/g, '') : 'request failed'
    throw new Error(`Gravity Forms API error (HTTP ${response.status}): ${message}`)
  }
  return body
}

function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}
