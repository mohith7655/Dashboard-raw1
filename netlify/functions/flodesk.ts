/**
 * List health, read from the Flodesk API.
 *
 * This is not the Mailchimp function with a different base URL, because
 * Flodesk does not expose the same thing. Its public API has no reporting
 * surface at all: `/campaigns` returns an id, a name, a subject, a status and
 * two timestamps, and there is no endpoint — and no field on that one — for
 * opens, clicks, recipients or a send time. `/reports` and `/analytics` are
 * both 404. So there is no open rate to show, and this function does not
 * invent one.
 *
 * What it can answer is how large the lists are, how they divide into
 * segments, and what has been sent. Engagement for Flodesk stays where it
 * already is — the Make.com sheet on the Lead Data tab counts the signups and
 * the orders those subscribers went on to place.
 *
 *   ?start=&end=
 */
import type {
  FlodeskCampaign,
  FlodeskReport,
  FlodeskSegment,
} from '../../src/lib/types'
import {
  asArray,
  isRecord,
  json,
  num,
  readRange,
  requireEnv,
  toErrorResponse,
} from '../lib/http'

const API = 'https://api.flodesk.com/v1'
const SOURCE = 'Flodesk'
const HINT =
  'Flodesk could not be reached. Check FLODESK_API_KEY is a current key — Flodesk → Account → Integrations → Flodesk API — and note it authenticates as HTTP basic, the whole key as the username with no password. Then click Retry.'

/**
 * Flodesk asks integrations to identify themselves, and rejects some requests
 * that arrive without a user agent naming one.
 */
const USER_AGENT = 'Rawwgear Dashboard (netlify-functions)'

export default async function handler(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url)
    const range = readRange(url)
    const key = requireEnv('FLODESK_API_KEY').trim()

    /*
     * Five calls. Three of them ask for a single row and read the count off
     * the pagination envelope rather than the body — `meta.total_items` is the
     * whole answer, and fetching 73,000 subscribers to length an array would
     * be absurd.
     */
    const [total, active, unsubscribed, segments, campaigns] = await Promise.all([
      countSubscribers(key, {}),
      countSubscribers(key, { status: 'active' }),
      countSubscribers(key, { status: 'unsubscribed' }),
      fetchSegments(key),
      fetchCampaigns(key),
    ])

    // Only the ones that actually went out. A draft is a campaign that has not
    // happened, and counting it beside sends would overstate the activity.
    const done = campaigns
      .filter((c) => c.status === 'done')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

    const report: FlodeskReport = {
      subscribers: { total, active, unsubscribed },
      segments,
      // Compared as plain days rather than as timestamps: the range is two
      // `yyyy-MM-dd` strings and Flodesk's stamps carry microseconds and a
      // zone, so trimming both to the date is the one comparison that cannot
      // be thrown by a difference in precision.
      campaigns: done.filter((c) => {
        const day = c.updatedAt.slice(0, 10)
        return day >= range.start && day <= range.end
      }),
      lastCampaignAt: done.length ? done[0].updatedAt : null,
      campaignsAllTime: done.length,
    }
    return json(report)
  } catch (err) {
    return toErrorResponse(err, HINT)
  }
}

/**
 * Flodesk authenticates as HTTP basic with the whole key as the username and
 * no password — not as a bearer token, which it answers with a bare 401 and no
 * indication that the scheme is the problem.
 */
async function call<T>(
  key: string,
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const query = new URLSearchParams(params).toString()
  const res = await fetch(`${API}${path}${query ? `?${query}` : ''}`, {
    headers: {
      authorization: `Basic ${btoa(`${key}:`)}`,
      'user-agent': USER_AGENT,
    },
  })

  const text = await res.text()
  if (!res.ok) {
    let detail = text.slice(0, 300)
    try {
      const body: unknown = JSON.parse(text)
      if (isRecord(body) && typeof body.message === 'string') detail = body.message
    } catch {
      /* Not JSON; the raw text above is the best available message. */
    }
    throw new Error(`${SOURCE} responded ${res.status}: ${detail}`)
  }

  return JSON.parse(text) as T
}

/** A count taken off the pagination envelope, without reading the rows. */
async function countSubscribers(
  key: string,
  filter: Record<string, string>,
): Promise<number> {
  const payload = await call<{ meta?: unknown }>(key, '/subscribers', {
    per_page: '1',
    ...filter,
  })
  return isRecord(payload.meta) ? num(payload.meta.total_items) : 0
}

async function fetchSegments(key: string): Promise<FlodeskSegment[]> {
  const payload = await call<{ data?: unknown }>(key, '/segments', { per_page: '100' })
  return asArray(payload.data)
    .filter(isRecord)
    .map((row) => ({
      id: typeof row.id === 'string' ? row.id : '',
      name: typeof row.name === 'string' ? row.name : '(unnamed)',
      members: num(row.total_active_subscribers),
      createdAt: typeof row.created_at === 'string' ? row.created_at : '',
    }))
    .sort((a, b) => b.members - a.members)
}

async function fetchCampaigns(key: string): Promise<FlodeskCampaign[]> {
  const payload = await call<{ data?: unknown }>(key, '/campaigns', { per_page: '100' })
  return asArray(payload.data)
    .filter(isRecord)
    .map((row) => ({
      id: typeof row.id === 'string' ? row.id : '',
      name: typeof row.name === 'string' ? row.name : '(untitled)',
      status: typeof row.status === 'string' ? row.status : '',
      subject: stripMarkup(typeof row.subject === 'string' ? row.subject : ''),
      createdAt: typeof row.created_at === 'string' ? row.created_at : '',
      updatedAt: typeof row.updated_at === 'string' ? row.updated_at : '',
    }))
}

/**
 * Flodesk returns the subject as a fragment of its editor's markup —
 * `<div data-paragraph="true">This Easter, stop losing reps</div>`. The tags
 * are stripped here rather than in the browser: the value is inserted as text
 * either way, so an unstripped subject would show its own markup to the reader.
 */
function stripMarkup(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}
