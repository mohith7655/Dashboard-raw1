import { ArrowDown, ArrowUp } from 'lucide-react'
import type { DateRange, MailchimpReport, Metric, Polarity } from '../../lib/types'
import { daysInRange } from '../../lib/dateRange'
import {
  formatCtr,
  formatDay,
  formatDeltaPercent,
  formatInteger,
  formatPercent,
} from '../../lib/format'
import { Skeleton } from '../Skeleton'

interface EmailStatsCardProps {
  report: MailchimpReport | undefined
  range: DateRange
  loading?: boolean
  failed?: boolean
  /**
   * Set on the Overview, where this is the only email figure on the page and
   * has to name its own source. On the Email tab the section heading above it
   * already does.
   */
  standalone?: boolean
}

/**
 * The period's sends as four figures.
 *
 * Mounted twice — at the head of the Email tab, and as a strip on the Overview
 * so email is visible without opening a tab. One component rather than two
 * copies of the arithmetic: the two would drift, and a reader comparing them
 * would have no way to tell which was current.
 */
export function EmailStatsCard({
  report,
  range,
  loading,
  failed,
  standalone,
}: EmailStatsCardProps) {
  if (loading) {
    return (
      <div className="card">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-3 h-3 w-full" />
      </div>
    )
  }

  if (failed || !report) {
    return (
      <div className="card text-[13px] text-muted">Email engagement unavailable</div>
    )
  }

  const days = daysInRange(range)
  const empty = report.campaigns.length === 0

  return (
    <div className={standalone ? 'card' : ''}>
      {standalone && (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <div className="kpi-label">Email — Mailchimp</div>
          <span className="text-[11.5px] text-label">
            {empty
              ? 'nothing sent in this period'
              : `${formatInteger(report.totals.campaigns.value)} ${
                  report.totals.campaigns.value === 1 ? 'send' : 'sends'
                } over ${days} ${days === 1 ? 'day' : 'days'}`}
          </span>
        </div>
      )}

      {empty ? (
        <p className="text-[12.5px] text-muted">
          No campaigns were sent in this period.
          {report.lastSendAt && (
            <> The most recent send was {formatDay(report.lastSendAt.slice(0, 10))}.</>
          )}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Headline
            label="Emails sent"
            metric={report.totals.emailsSent}
            format={formatInteger}
            note={
              standalone
                ? ''
                : `across ${formatInteger(report.totals.campaigns.value)} ${
                    report.totals.campaigns.value === 1 ? 'campaign' : 'campaigns'
                  }`
            }
          />
          <Headline
            label="Open rate"
            metric={report.totals.openRate}
            format={formatPercent}
            note={
              // The proxy-excluded figure sits under the headline rather than
              // replacing it: Apple Mail opens every message its users are
              // sent, so the raw rate is inflated by an unknown amount and
              // this is the floor under it. Both are true; neither alone is.
              report.proxyExcludedOpenRate === null
                ? 'across every send in the period'
                : `${formatPercent(report.proxyExcludedOpenRate)} excluding proxy opens`
            }
          />
          <Headline
            label="Click rate"
            metric={report.totals.clickRate}
            format={formatCtr}
            note={
              report.benchmark
                ? `${formatCtr(report.benchmark.clickRate)} is the sector average`
                : 'unique subscriber clicks'
            }
          />
          <Headline
            label="Unsubscribes"
            metric={report.totals.unsubscribed}
            format={formatInteger}
            polarity="down-good"
            note={`${formatCtr(report.totals.unsubscribeRate.value)} of those sent to`}
          />
        </div>
      )}
    </div>
  )
}

/**
 * A big box, matching the pair that leads the CEO Dashboard and the three on
 * the Leads tab.
 */
function Headline({
  label,
  metric,
  format,
  note,
  polarity = 'up-good',
}: {
  label: string
  metric: Metric
  format: (n: number) => string
  note: string
  polarity?: Polarity
}) {
  const change = metric.deltaPct
  const good = change === null || change === 0
    ? null
    : polarity === 'down-good'
      ? change < 0
      : change > 0

  return (
    <div className="min-w-0 rounded-lg border border-btn-border px-3 py-2.5">
      <div className="truncate text-[10.5px] uppercase tracking-wide text-label">
        {label}
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="truncate text-[24px] font-semibold leading-tight tabular-nums text-ink">
          {format(metric.value)}
        </span>
        {change !== null && (
          <span
            className={`flex items-center gap-0.5 text-[11px] tabular-nums ${
              good === null ? 'text-muted' : good ? 'text-pos' : 'text-neg'
            }`}
          >
            {change < 0 ? (
              <ArrowDown size={10} strokeWidth={3} />
            ) : (
              <ArrowUp size={10} strokeWidth={3} />
            )}
            {formatDeltaPercent(change)}
          </span>
        )}
      </div>
      {note && <div className="mt-0.5 truncate text-[11px] text-label">{note}</div>}
    </div>
  )
}
