import type {
  InsightsAnswer,
  InsightsReport,
  TargetAdvice,
  TargetNote,
  TargetNoteTone,
} from '../../src/lib/types'
import {
  BadRequest,
  asArray,
  isRecord,
  jsonNoStore,
  requireEnv,
  toErrorResponse,
} from '../lib/http'

const API = 'https://api.openai.com/v1/chat/completions'
const HINT =
  'Check OPENAI_API_KEY, and that OPENAI_MODEL names a model your account can use. Then click Analyze again.'

/**
 * The task is comparative rather than extractive — it has to weigh channels
 * against each other and rank what to do about it — so this is the strongest
 * general model rather than a mini. Roughly 3.6k tokens and 20s per run.
 * `OPENAI_MODEL` names any other Chat Completions model.
 */
const DEFAULT_MODEL = 'gpt-5.4'

/** A full report measures ~1.7k completion tokens; the rest is headroom for a
 *  reasoning model's hidden tokens. Too low and the content comes back empty. */
const MAX_TOKENS = 4000

/**
 * Narrative analysis of the period, written by OpenAI.
 *
 * The browser posts the same aggregates it is already displaying rather than
 * having this function re-fetch every connector: the analysis then describes
 * exactly what is on screen, and a broken connector degrades the commentary
 * instead of failing it.
 *
 * Nothing order-level or personal is sent — the snapshot is built from totals
 * and breakdowns only. See `buildSnapshot` on the client.
 */
export default async function handler(request: Request): Promise<Response> {
  try {
    if (request.method !== 'POST') {
      throw new BadRequest('This endpoint accepts POST only')
    }

    const body = await readSnapshot(request)
    const apiKey = requireEnv('OPENAI_API_KEY')
    const model = process.env.OPENAI_MODEL || DEFAULT_MODEL

    // Two modes on one endpoint, told apart by the body. A posted `question`
    // asks about the period in prose; anything else is the whole snapshot and
    // gets the structured report. Older callers post the snapshot bare, and
    // still reach the report.
    const question = typeof body.question === 'string' ? body.question.trim() : ''
    if (question && isRecord(body.snapshot)) {
      return jsonNoStore(await answer(body.snapshot, question, apiKey, model))
    }

    // A posted `target` asks what to do about one goal, given the arithmetic
    // the client has already done and the period behind it.
    if (isRecord(body.target) && isRecord(body.plan)) {
      return jsonNoStore(await adviseTarget(body, apiKey, model))
    }

    // A posted `section` asks about one card rather than the whole period:
    // what moved on it, and what to do about that.
    if (typeof body.section === 'string' && isRecord(body.snapshot)) {
      return jsonNoStore(await analyseSection(body, apiKey, model))
    }

    const report = await analyse(body, apiKey, model)
    return jsonNoStore(report)
  } catch (err) {
    return toErrorResponse(err, HINT)
  }
}

/** A typed question costs a fraction of a full report, and answers in prose. */
const ANSWER_MAX_TOKENS = 2000

const ASK_SYSTEM = `You are an e-commerce analyst answering one question about a single store over a single date range.

You are given a JSON snapshot of that period — store revenue and costs from WooCommerce (via Metorik), ad spend from Meta and Google Ads, traffic from Google Analytics 4 — and a question from the person reading the dashboard it came from.

Rules:
- Answer only from the snapshot. Never invent a number, and never estimate one that is absent.
- If the snapshot does not contain what was asked, say exactly that and name the figure that is missing. Do not substitute a near-enough one without saying so.
- Quote the figures behind the answer, with their units.
- deltaPct values are fractions against the comparison window (0.12 means +12%). Rates such as conversionRate, margin, ctr and engagementRate are fractions, not percentages.
- Blended ROAS is store revenue over total ad spend; platform ROAS is the platform's own attributed figure. They disagree by design — do not present either as the other.
- Be brief: a few sentences, or a short list where the question asks for several things. No preamble, no restating the question.
- If the question is not about this store's figures, say so in one line rather than answering from general knowledge.

Reply with JSON only: {"answer": string}`

async function answer(
  snapshot: Record<string, unknown>,
  question: string,
  apiKey: string,
  model: string,
): Promise<InsightsAnswer> {
  const content = await complete(
    apiKey,
    model,
    ASK_SYSTEM,
    JSON.stringify({ question, snapshot }),
    ANSWER_MAX_TOKENS,
  )

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('OpenAI API error (PARSE): the model did not return valid JSON.')
  }

  const record = isRecord(parsed) ? parsed : {}
  const text = typeof record.answer === 'string' ? record.answer.trim() : ''
  return {
    question,
    answer: text || 'No answer returned.',
    model,
    answeredAt: new Date().toISOString(),
  }
}

/** Advice on one target costs a fraction of a full report. */
const ADVICE_MAX_TOKENS = 2000

const TARGET_SYSTEM = `You are an e-commerce analyst advising on one commercial target for a single store.

You are given JSON with three parts:
- \`target\`: the commitment as its owner set it. \`aims\` is one or more things to reach, each with a \`goal\` and an \`amount\`. The goals are "revenue" (money the store kept), "sales" (money it billed, before refunds), "profit" (net profit, after goods, advertising and overheads) and "roas" (a return to hold, not an amount to reach). \`budgetPct\` is the ad budget as a percentage of sales. \`start\` and \`deadline\` are the window it runs over; every aim must be met by the deadline. Where \`plan.notStarted\` is true the window has not opened yet, and the rates are struck across the whole of it rather than counted down.
- \`plan\`: the arithmetic already done on the client — the budget the percentage resolves to, the daily/weekly/monthly split over the days remaining, what the store is currently spending per day, the budget the goal implies at the current return, how much of the goal is in reach, and \`aims\`, which restates each aim with the rate it must be met at and the rate the store is actually running at against it.
- \`snapshot\`: the period the store has actually just traded, including revenue, costs, margin, ad spend and return by platform.

Rules:
- Reason only from those figures. Never invent a number, and never estimate one that is absent.
- Quote the figures behind each point, with units.
- Money is in the store's own currency, named as \`currency\` in the snapshot. Use that one. Never substitute a different symbol, and where none is given write the amount bare rather than guessing at a country.
- The client's arithmetic is correct. Do not re-derive it or contradict it; explain what it means and what to do.
- deltaPct values are percentages against the comparison window (12 means +12%). Rates such as margin and shareOfRevenue are fractions.
- Blended ROAS is store revenue over total ad spend; platform ROAS is the platform's own attributed figure. They disagree by design.
- Money aims and a return aim take opposite advice about budget, and confusing them is the one mistake that makes this section worse than useless:
  - a "roas" aim: more spend at a return below target makes the target worse. Never advise raising budget to fix a return.
  - a "revenue", "sales" or "profit" aim: \`impliedBudget\` is what the goal costs at the current return. Where it exceeds the budget set, raising spend to meet it is the direct lever and should be said plainly, with the shortfall in currency.
- Where a target carries both, say so rather than picking one: the way to meet them together is a better return, not a bigger budget.
- Address every aim on the target. An aim the store is on pace for still deserves a sentence saying so — silence about it reads as an oversight.
- The money aims are not interchangeable. Revenue is what the store kept, sales what it billed, profit what was left after the goods, the advertising and the overheads. Advice that raises revenue can lower profit; where the target names both, say which way the trade runs.
- \`attainment\` is what the budget buys against the goal. Each aim's \`paceAttainment\` is what current trading reaches against that aim, before any change to spend. They are different questions — name which one you mean, and never quote one as the other.
- Be specific and short. Each note is one claim with the figures that support it and the action it implies.
- Never name a JSON field in the prose. Write "current trading reaches 51% of the goal", not "paceAttainment is 0.513". The reader has never seen the payload and should not have to.
- Write dates as a person would — "31 August", not "2026-08-31". Do not open a note with "Action:"; say what to do in a sentence.
- Rank them: whether the goal is reachable at all first, then where the money should go, then what is quietly limiting it.
- Between three and five notes. \`tone\` is "good" where nothing needs doing, "warn" where something should be watched, "bad" where the target is at risk.

Reply with JSON only:
{"headline": string, "notes": [{"tone": "good"|"warn"|"bad", "title": string, "detail": string}]}`

/**
 * What to do about one target, written by OpenAI.
 *
 * The client posts the plan it has already computed rather than having this
 * re-derive it: the advice then explains the figures actually on screen, and
 * the model is never in a position to state a budget that disagrees with the
 * one printed above it.
 */
async function adviseTarget(
  body: Record<string, unknown>,
  apiKey: string,
  model: string,
): Promise<TargetAdvice> {
  const content = await complete(
    apiKey,
    model,
    TARGET_SYSTEM,
    JSON.stringify({
      target: body.target,
      plan: body.plan,
      snapshot: isRecord(body.snapshot) ? body.snapshot : {},
    }),
    ADVICE_MAX_TOKENS,
  )

  return readAdvice(content, model)
}

/**
 * A headline and its notes, as both the target advice and the section review
 * return them.
 *
 * Notes missing a title or a detail are dropped rather than rendered half
 * empty: a bullet with a heading and no claim under it reads as a bug in the
 * card, which is worse than one fewer note.
 */
function readAdvice(content: string, model: string): TargetAdvice {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('OpenAI API error (PARSE): the model did not return valid JSON.')
  }

  const record = isRecord(parsed) ? parsed : {}
  const notes: TargetNote[] = []
  for (const row of asArray(record.notes).filter(isRecord)) {
    const title = typeof row.title === 'string' ? row.title.trim() : ''
    const detail = typeof row.detail === 'string' ? row.detail.trim() : ''
    if (!title || !detail) continue
    notes.push({ tone: readTone(row.tone), title, detail })
  }

  return {
    headline:
      typeof record.headline === 'string' && record.headline.trim()
        ? record.headline.trim()
        : 'No summary returned.',
    notes,
    model,
    generatedAt: new Date().toISOString(),
  }
}

/** One section costs about what one target does. */
const SECTION_MAX_TOKENS = 2000

/** How much operator-written instruction is carried into the prompt. */
const MAX_PROMPT_CHARS = 2000

const SECTION_SYSTEM = `You are an e-commerce analyst reviewing one section of a store's dashboard for a single date range.

You are given JSON with:
- \`section\`: which card is being reviewed, and \`label\`, what it is called on screen.
- \`snapshot\`: exactly the figures that card is displaying, including the comparison window where it has one.

Your job is two things, in this order: what changed against the comparison window, and what to do about it. Not a description of the figures — the reader can see them.

Rules:
- Reason only from the snapshot. Never invent a number, and never estimate one that is absent.
- Where the snapshot has no comparison window, say that the change cannot be measured rather than treating the current figure as the change.
- Quote the figures behind each point, with units. Money is in the store's own currency, named as \`currency\` where the snapshot gives it; where none is given, write the amount bare rather than guessing at a country.
- deltaPct values are percentages against the comparison window (12 means +12%). Rates such as margin, conversion and share are fractions.
- Absence is not zero. A source that reported nothing, or an automation that has stopped writing, is a finding in itself — say so rather than reading its silence as a result.
- Every improvement must be something the reader could actually do this week, tied to a figure in the snapshot. No generic advice.
- Where the figures do not support a confident recommendation, say what to measure first instead of guessing.
- Never name a JSON field in the prose. Write "leads fell 22%", not "count.deltaPct is -22".
- Write dates as a person would — "31 August", not "2026-08-31". Do not open a note with "Action:".
- Between three and five notes. \`tone\` is "good" where nothing needs doing, "warn" where something should be watched, "bad" where something is going wrong.

Reply with JSON only:
{"headline": string, "notes": [{"tone": "good"|"warn"|"bad", "title": string, "detail": string}]}`

/**
 * One section of the dashboard, reviewed on request.
 *
 * The operator's own prompt is appended to the rules above rather than
 * replacing them. It says what this reader cares about — which campaigns
 * matter, which figure they are judged on — and that is worth carrying. What
 * it cannot do is license the model to invent a figure or to describe a
 * connector's silence as a zero, so the rules that forbid those stay above it
 * and the prompt is introduced as a preference rather than as an instruction
 * that outranks them.
 */
async function analyseSection(
  body: Record<string, unknown>,
  apiKey: string,
  model: string,
): Promise<TargetAdvice> {
  const prompt =
    typeof body.prompt === 'string' ? body.prompt.trim().slice(0, MAX_PROMPT_CHARS) : ''

  const system = prompt
    ? `${SECTION_SYSTEM}

The reader of this dashboard has written down what they want attention paid to. Follow it where it does not conflict with the rules above; the rules above win on any point of conflict, and it can never license inventing or estimating a figure.

Their note: ${prompt}`
    : SECTION_SYSTEM

  const content = await complete(
    apiKey,
    model,
    system,
    JSON.stringify({
      section: body.section,
      label: typeof body.label === 'string' ? body.label : body.section,
      snapshot: body.snapshot,
    }),
    SECTION_MAX_TOKENS,
  )

  return readAdvice(content, model)
}

/** Anything the model invents outside the three tones reads as a warning. */
function readTone(raw: unknown): TargetNoteTone {
  return raw === 'good' || raw === 'bad' ? raw : 'warn'
}

async function readSnapshot(request: Request): Promise<Record<string, unknown>> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new BadRequest('Request body must be JSON')
  }
  if (!isRecord(body)) throw new BadRequest('Request body must be a JSON object')
  return body
}

const SYSTEM = `You are an e-commerce analyst reviewing one store's performance for a single date range.

You are given a JSON snapshot containing store revenue and costs from WooCommerce (via Metorik), ad spend from Meta and Google Ads, and traffic from Google Analytics 4. Reply with JSON only.

Rules:
- Use only the figures in the snapshot. Never invent a number, and never estimate one that is absent.
- A connector may be missing or have failed. Say so plainly rather than treating absence as zero.
- Quote the specific figures that drive each point, with their units.
- Prefer comparisons that change a decision: channel against channel, spend against the revenue it earned, this period against the previous one where deltaPct is given.
- deltaPct values are fractions against the preceding period of equal length (0.12 means +12%). Rates such as conversionRate, margin, ctr and engagementRate are also fractions, not percentages.
- Blended ROAS is store revenue over total ad spend; platform ROAS is the platform's own attributed figure. They disagree by design — do not present either as the other.
- Be concrete and specific to this store. No generic e-commerce advice.
- If the data does not support a confident recommendation, say what to measure first instead of guessing.

Return an object with exactly these keys:
{
  "headline": string,             // one sentence, the single most important thing about this period
  "summary": string,              // 2-4 sentences of plain prose
  "findings": [                   // 3-6 observations, most important first
    {
      "title": string,
      "detail": string,
      "severity": "critical" | "warning" | "good",
      "evidence": string          // the figures behind it, e.g. "Paid Social: 9,471 users, 16 purchases, $754"
    }
  ],
  "actions": [                    // 3-6 steps, most valuable first
    {
      "title": string,            // imperative, e.g. "Cut Paid Social budget by half"
      "detail": string,           // why, and what to expect
      "impact": "high" | "medium" | "low",
      "effort": "low" | "medium" | "high",
      "metric": string            // the one number that tells you it worked
    }
  ]
}`

/** One JSON completion, shared by the report and the typed question. */
async function complete(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  maxTokens: number,
): Promise<string> {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      // Omitted deliberately: the GPT-5 family rejects a non-default
      // temperature on this endpoint, and the schema constrains output anyway.
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: maxTokens,
    }),
  })

  const body: unknown = await res.json()
  if (!res.ok) throw new Error(readOpenAiError(body, res.status))

  const record = isRecord(body) ? body : {}
  const choice = asArray(record.choices).filter(isRecord)[0]
  const message = choice && isRecord(choice.message) ? choice.message : {}
  const content = typeof message.content === 'string' ? message.content : ''

  if (!content.trim()) {
    // A reasoning model that spends its whole budget thinking returns an empty
    // string with finish_reason `length`, which is not obvious from the body.
    const reason = choice ? String(choice.finish_reason ?? 'unknown') : 'unknown'
    throw new Error(
      `OpenAI API error (EMPTY): ${model} returned no content (finish_reason: ${reason}).` +
        (reason === 'length' ? ' Raise the token budget or use a smaller model.' : ''),
    )
  }

  return content
}

async function analyse(
  snapshot: Record<string, unknown>,
  apiKey: string,
  model: string,
): Promise<InsightsReport> {
  const content = await complete(
    apiKey,
    model,
    SYSTEM,
    JSON.stringify(snapshot),
    MAX_TOKENS,
  )

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('OpenAI API error (PARSE): the model did not return valid JSON.')
  }

  return normalise(parsed, model)
}

/* ------------------------------------------------------------------ *
 * The model is instructed to return this shape, but nothing enforces it,
 * so every field is coerced before it reaches the UI.
 * ------------------------------------------------------------------ */

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => {
  const found = allowed.find((a) => a === str(v).toLowerCase())
  return found ?? fallback
}

const SEVERITIES = ['critical', 'warning', 'good'] as const
const LEVELS = ['high', 'medium', 'low'] as const

function normalise(parsed: unknown, model: string): InsightsReport {
  const record = isRecord(parsed) ? parsed : {}

  return {
    headline: str(record.headline) || 'No headline returned.',
    summary: str(record.summary),
    findings: asArray(record.findings)
      .filter(isRecord)
      .map((row) => ({
        title: str(row.title),
        detail: str(row.detail),
        severity: oneOf(row.severity, SEVERITIES, 'warning'),
        evidence: str(row.evidence),
      }))
      .filter((row) => row.title !== ''),
    actions: asArray(record.actions)
      .filter(isRecord)
      .map((row) => ({
        title: str(row.title),
        detail: str(row.detail),
        impact: oneOf(row.impact, LEVELS, 'medium'),
        effort: oneOf(row.effort, LEVELS, 'medium'),
        metric: str(row.metric),
      }))
      .filter((row) => row.title !== ''),
    model,
    generatedAt: new Date().toISOString(),
  }
}

function readOpenAiError(body: unknown, status: number): string {
  if (isRecord(body) && isRecord(body.error)) {
    const { message, code } = body.error
    const text = typeof message === 'string' ? message : 'request failed'
    return `OpenAI API error (${typeof code === 'string' ? code : status}): ${text}`
  }
  return `OpenAI API error (${status}): request failed`
}
