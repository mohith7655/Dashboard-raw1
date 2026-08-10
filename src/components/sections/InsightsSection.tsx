import { useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  SendHorizonal,
  Settings2,
  Sparkles,
  XCircle,
} from 'lucide-react'
import type {
  InsightFinding,
  InsightLevel,
  InsightSeverity,
  InsightsAutomation,
  InsightsReport,
  InsightsSchedule,
  SourceError,
} from '../../lib/types'
import { useAskInsights } from '../../lib/queries'
import { formatRangeLabel } from '../../lib/dateRange'
import { Pill, PILL_COLORS } from '../Pill'
import { SectionLabel } from '../SectionLabel'
import { Skeleton } from '../Skeleton'
import { InsightsScheduleCard } from './InsightsScheduleCard'

interface InsightsSectionProps {
  report: InsightsReport | undefined
  onAnalyse: () => void
  running: boolean
  error: SourceError | null
  /** False until every connector has settled, so the model never reads a half-loaded period. */
  ready: boolean
  rangeLabel: string
  /**
   * The same aggregates the Analyze button sends, built on demand. A question
   * is answered from exactly the figures on screen, so the two must not be
   * able to describe different periods.
   */
  getSnapshot: () => Record<string, unknown>
  /** The schedule, and the last report anything wrote — shown when this session has none. */
  automation: InsightsAutomation | undefined
  automationLoading: boolean
  automationError: string | null
  savingSchedule: boolean
  onSaveSchedule: (schedule: InsightsSchedule) => void
}

const SEVERITY: Record<
  InsightSeverity,
  { color: string; icon: typeof AlertTriangle; label: string }
> = {
  critical: { color: PILL_COLORS.red, icon: XCircle, label: 'Critical' },
  warning: { color: PILL_COLORS.amber, icon: AlertTriangle, label: 'Watch' },
  good: { color: PILL_COLORS.green, icon: CheckCircle2, label: 'Working' },
}

const IMPACT: Record<InsightLevel, string> = {
  high: PILL_COLORS.green,
  medium: PILL_COLORS.blue,
  low: PILL_COLORS.grey,
}

/**
 * Written by OpenAI from the same aggregates the other tabs display.
 *
 * The analysis runs on click rather than on view: every run costs money, and a
 * report that silently regenerated whenever the range changed would be both
 * expensive and impossible to compare against.
 */
export function InsightsSection({
  report,
  onAnalyse,
  running,
  error,
  ready,
  rangeLabel,
  getSnapshot,
  automation,
  automationLoading,
  automationError,
  savingSchedule,
  onSaveSchedule,
}: InsightsSectionProps) {
  const [showSettings, setShowSettings] = useState(false)

  // This session's report wins, and the last stored one stands in until there
  // is one. Without that, a report written overnight — or one paid for before
  // a reload — would be invisible, and the reader would buy it twice.
  const stored = automation?.latest
  const shown = report ?? stored?.report
  const shownRange = report ? rangeLabel : stored ? formatRangeLabel(stored.range) : rangeLabel
  const scheduled = !report && stored?.trigger === 'scheduled'

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* One line, not two: what the button does is on the button, and the
            standing explanation cost a paragraph of height on every view. The
            provenance stays, because a report on screen has to say which period
            and model it came from — that is a fact about what is being read,
            not an instruction for how to use it. */}
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <SectionLabel>Insights</SectionLabel>
          {shown && (
            <span className="text-[12px] text-muted">
              {`${scheduled ? 'Written on schedule for' : 'Analysed'} ${shownRange} with ${
                shown.model
              } · ${new Date(shown.generatedAt).toLocaleString()}`}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSettings((open) => !open)}
            aria-expanded={showSettings}
            className={`flex h-9 items-center gap-2 rounded-lg border border-btn-border bg-btn px-3 text-[13px] transition-colors hover:border-[#3a3a40] ${
              showSettings ? 'text-ink' : 'text-muted'
            }`}
          >
            <Settings2 size={14} />
            Schedule
          </button>

          <button
            type="button"
            onClick={onAnalyse}
            disabled={running || !ready}
            className="flex h-9 items-center gap-2 rounded-lg border border-btn-border bg-btn px-3 text-[13px] text-ink transition-colors hover:border-[#3a3a40] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? (
              <Loader2 size={14} className="animate-spin text-muted" />
            ) : (
              <Sparkles size={14} className="text-muted" />
            )}
            {running ? 'Analyzing…' : shown ? 'Re-analyze' : 'Analyze'}
          </button>
        </div>
      </div>

      {showSettings && (
        <InsightsScheduleCard
          automation={automation}
          loading={automationLoading}
          error={automationError}
          saving={savingSchedule}
          onSave={onSaveSchedule}
        />
      )}

      {/* The way an operator finds out an unattended run failed is by opening
          a dashboard with no new report on it, so the reason has to be here
          rather than only in the function log. */}
      {automation?.lastError && (
        <p className="text-[12px] leading-relaxed text-neg">
          The last scheduled run failed: {automation.lastError}
        </p>
      )}

      {!ready && !shown && (
        <p className="text-[12px] text-muted">Waiting for the connectors to load…</p>
      )}

      <AskBox getSnapshot={getSnapshot} ready={ready} />

      {error && (
        <div className="card border-[#ef444455]">
          <h3 className="text-[14px] font-medium text-ink">{error.source} failed</h3>
          <p className="mt-1.5 text-[13px] text-muted">{error.message}</p>
          {error.hint && <p className="mt-1 text-[12px] text-muted">{error.hint}</p>}
        </div>
      )}

      {running && !shown && <LoadingBody />}

      {shown && (
        <div className="flex flex-col gap-4">
          {/* A stored report describes the period it was written for, which is
              rarely the one the picker is showing. Saying so outright is the
              only thing that stops it being read as this period's. */}
          {!report && stored && (
            <p className="text-[12px] text-muted">
              Kept from the last run — it describes{' '}
              <span className="text-ink">{formatRangeLabel(stored.range)}</span>, not
              the period selected above. Click Analyze for {rangeLabel}.
            </p>
          )}

          <div className="card">
            <h3 className="text-[15px] font-semibold leading-snug text-ink">
              {shown.headline}
            </h3>
            {shown.summary && (
              <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-muted">
                {shown.summary}
              </p>
            )}
          </div>

          {shown.findings.length > 0 && (
            <div>
              <h3 className="mb-3 text-[15px] font-semibold text-ink">What the data shows</h3>
              <div className="flex flex-col gap-3">
                {shown.findings.map((finding, i) => (
                  <FindingCard key={i} finding={finding} />
                ))}
              </div>
            </div>
          )}

          {shown.actions.length > 0 && (
            <div>
              <h3 className="mb-3 text-[15px] font-semibold text-ink">What to do next</h3>
              <ol className="flex flex-col gap-3">
                {shown.actions.map((action, i) => (
                  <li key={i} className="card">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h4 className="flex min-w-0 items-baseline gap-2 text-[14px] font-medium text-ink">
                        <span className="text-muted tabular-nums">{i + 1}.</span>
                        <span>{action.title}</span>
                      </h4>
                      <div className="flex shrink-0 gap-1.5">
                        <Pill color={IMPACT[action.impact]}>{action.impact} impact</Pill>
                        <Pill color={PILL_COLORS.grey}>{action.effort} effort</Pill>
                      </div>
                    </div>
                    <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-muted">
                      {action.detail}
                    </p>
                    {action.metric && (
                      <p className="mt-2.5 text-[12px] text-muted">
                        <span className="text-ink">Measure:</span> {action.metric}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}

          <p className="text-[12px] leading-relaxed text-muted">
            Written by {shown.model} from the aggregates on the other tabs — totals
            and breakdowns only, no order or customer records. Check the figures it
            quotes before acting on them.
          </p>
        </div>
      )}
    </section>
  )
}

function FindingCard({ finding }: { finding: InsightFinding }) {
  const { color, icon: Icon, label } = SEVERITY[finding.severity]

  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="flex min-w-0 items-center gap-2 text-[14px] font-medium text-ink">
          <Icon size={15} style={{ color }} className="shrink-0" />
          <span>{finding.title}</span>
        </h4>
        <Pill color={color}>{label}</Pill>
      </div>
      <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-muted">
        {finding.detail}
      </p>
      {finding.evidence && (
        <p className="mt-2.5 border-l-2 border-line pl-2.5 text-[12px] tabular-nums text-muted">
          {finding.evidence}
        </p>
      )}
    </div>
  )
}

function LoadingBody() {
  return (
    <div className="flex flex-col gap-4">
      <div className="card">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="mt-3 h-3 w-full" />
        <Skeleton className="mt-2 h-3 w-4/5" />
      </div>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="card">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-3 h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-3/5" />
        </div>
      ))}
    </div>
  )
}

/**
 * A question typed against the period on screen, answered from the same
 * aggregates the report is written from.
 *
 * Separate from the report rather than folded into it: the report is one
 * expensive pass over everything, and most questions are a single figure the
 * reader could not find. Answers stack under the box so a follow-up can be
 * read against what prompted it.
 */
function AskBox({
  getSnapshot,
  ready,
}: {
  getSnapshot: () => Record<string, unknown>
  ready: boolean
}) {
  const [question, setQuestion] = useState('')
  const { ask, answers, asking, error } = useAskInsights()

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const text = question.trim()
    if (!text || asking || !ready) return
    ask({ snapshot: getSnapshot(), question: text })
    // Cleared on send rather than on success: the question is already on
    // screen in the thread below, and leaving it in the box invites sending
    // the same one twice.
    setQuestion('')
  }

  return (
    <div className="card flex flex-col gap-3">
      <form onSubmit={submit} className="flex items-center gap-2">
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          disabled={!ready}
          placeholder={
            ready
              ? 'Ask about this period — e.g. which country costs most to ship to?'
              : 'Waiting for the connectors to load…'
          }
          aria-label="Ask a question about this period"
          className="h-9 min-w-0 flex-1 rounded-lg border border-btn-border bg-btn px-3 text-[13px] text-ink outline-none transition-colors placeholder:text-label focus:border-[#3d3d44] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!question.trim() || asking || !ready}
          aria-label="Send question"
          className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-btn-border bg-btn px-3 text-[13px] text-ink transition-colors hover:border-[#3a3a40] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {asking ? (
            <Loader2 size={14} className="animate-spin text-muted" />
          ) : (
            <SendHorizonal size={14} className="text-muted" />
          )}
          {asking ? 'Asking…' : 'Ask'}
        </button>
      </form>

      {error && (
        <p className="text-[12px] text-neg">
          {error.source} failed: {error.message}
        </p>
      )}

      {answers.map((entry) => (
        <div
          key={entry.answeredAt}
          className="border-t border-row-line pt-3 first:border-0 first:pt-0"
        >
          <p className="text-[13px] font-medium text-ink">{entry.question}</p>
          <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-muted">
            {entry.answer}
          </p>
          <p className="mt-1.5 text-[11px] text-label">
            {entry.model} · {new Date(entry.answeredAt).toLocaleTimeString()}
          </p>
        </div>
      ))}
    </div>
  )
}
