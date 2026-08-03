import { AlertTriangle, CheckCircle2, Loader2, Sparkles, XCircle } from 'lucide-react'
import type {
  InsightFinding,
  InsightLevel,
  InsightSeverity,
  InsightsReport,
  SourceError,
} from '../../lib/types'
import { Pill, PILL_COLORS } from '../Pill'
import { SectionLabel } from '../SectionLabel'
import { Skeleton } from '../Skeleton'

interface InsightsSectionProps {
  report: InsightsReport | undefined
  onAnalyse: () => void
  running: boolean
  error: SourceError | null
  /** False until every connector has settled, so the model never reads a half-loaded period. */
  ready: boolean
  rangeLabel: string
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
}: InsightsSectionProps) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionLabel>Insights</SectionLabel>
          <p className="mt-1 text-[12px] text-muted">
            {report
              ? `Analysed ${rangeLabel} with ${report.model} · ${new Date(
                  report.generatedAt,
                ).toLocaleTimeString()}`
              : `Reads the figures for ${rangeLabel} and writes up what changed and what to do.`}
          </p>
        </div>

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
          {running ? 'Analyzing…' : report ? 'Re-analyze' : 'Analyze'}
        </button>
      </div>

      {!ready && !report && (
        <p className="text-[12px] text-muted">Waiting for the connectors to load…</p>
      )}

      {error && (
        <div className="card border-[#ef444455]">
          <h3 className="text-[14px] font-medium text-ink">{error.source} failed</h3>
          <p className="mt-1.5 text-[13px] text-muted">{error.message}</p>
          {error.hint && <p className="mt-1 text-[12px] text-muted">{error.hint}</p>}
        </div>
      )}

      {running && !report && <LoadingBody />}

      {report && (
        <div className="flex flex-col gap-4">
          <div className="card">
            <h3 className="text-[15px] font-semibold leading-snug text-ink">
              {report.headline}
            </h3>
            {report.summary && (
              <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-muted">
                {report.summary}
              </p>
            )}
          </div>

          {report.findings.length > 0 && (
            <div>
              <h3 className="mb-3 text-[15px] font-semibold text-ink">What the data shows</h3>
              <div className="flex flex-col gap-3">
                {report.findings.map((finding, i) => (
                  <FindingCard key={i} finding={finding} />
                ))}
              </div>
            </div>
          )}

          {report.actions.length > 0 && (
            <div>
              <h3 className="mb-3 text-[15px] font-semibold text-ink">What to do next</h3>
              <ol className="flex flex-col gap-3">
                {report.actions.map((action, i) => (
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
            Written by {report.model} from the aggregates on the other tabs — totals
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
