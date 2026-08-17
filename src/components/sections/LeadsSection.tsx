import { useId, useMemo, useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, Mail, Megaphone, UserPlus } from 'lucide-react'
import type { AdsMetrics, DateRange, LeadReport } from '../../lib/types'
import { LEAD_SOURCES, LEAD_SOURCE_LABELS } from '../../lib/types'
import { daysInRange } from '../../lib/dateRange'
import { deltaPct } from '../../lib/derive'
import {
  formatCurrency,
  formatDay,
  formatDecimal,
  formatDeltaPercent,
  formatInteger,
  formatComparison,
} from '../../lib/format'
import { RowsCard } from '../RowsCard'
import { SectionLabel } from '../SectionLabel'
import {
  AnalyseButton,
  SectionAnalysis,
  type SectionAnalysisWiring,
} from '../SectionAnalysis'
import type { StatRowData } from '../StatRows'
import { Skeleton } from '../Skeleton'
import { LeadsOverTime } from '../charts/LeadsOverTime'

interface LeadsSectionProps {
  report: LeadReport | undefined
  loading: boolean
  failed: boolean
  range: DateRange
  /**
   * The window the counts are compared against, or null when comparison is
   * off. Needed for the rate rather than the totals: a baseline of a different
   * length has to be divided by its own days before the two can be set side by
   * side.
   */
  against: DateRange | null
  /**
   * Meta's figures for the same period, for the one thing a lead count cannot
   * say on its own: what each one cost.
   */
  meta: AdsMetrics | undefined
  /**
   * The AI review of this section: the saved prompt, and what the last run
   * returned. Passed in rather than held here so the whole page has one
   * analyser and one prompt store between it and the sections that use them.
   */
  analysis: SectionAnalysisWiring
}


/**
 * How many days behind the sheet has to fall before it is called out.
 *
 * Two days rather than one: the automations run on a schedule, and a tab that
 * has not been written to since yesterday is ordinary rather than broken.
 */
const STALE_AFTER_DAYS = 2

/**
 * Leads, from the sheet the Make.com automations write into.
 *
 * The dashboard's one view of the funnel before the order. Everything else
 * here starts at the sale; this starts at the address that might become one,
 * and ends at the share of a cohort that did.
 */
export function LeadsSection({
  report,
  loading,
  failed,
  range,
  against,
  meta,
  analysis,
}: LeadsSectionProps) {
  const days = daysInRange(range)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const analysisId = useId()

  /** Signups and captures, each source against its own previous window. */
  const sourceRows = useMemo((): StatRowData[] => {
    if (!report) return []

    const total = LEAD_SOURCES.reduce(
      (sum, key) => sum + report.sources[key].count.value,
      0,
    )

    const rows: StatRowData[] = [
      {
        label: 'New leads',
        value: formatInteger(total),
        kind: 'total',
        share: null,
        // No change on the heading: the sources it sums have their own
        // baselines and one of them can be missing, which would make a
        // combined delta compare a two-source total against a three-source one.
        change: null,
        polarity: 'up-good',
      },
    ]

    for (const key of LEAD_SOURCES) {
      const { count } = report.sources[key]
      rows.push({
        label: LEAD_SOURCE_LABELS[key],
        value: formatInteger(count.value),
        kind: 'part',
        share: total ? count.value / total : 0,
        change: count.deltaPct,
        ...formatComparison(count, formatInteger),
        polarity: 'up-good',
      })
    }

    return rows
  }, [report])

  /** What the list sold, and what a lead cost to get. */
  const valueRows = useMemo((): StatRowData[] => {
    if (!report) return []

    const rows: StatRowData[] = []
    const listOrders =
      report.orders.mailchimp.count.value + report.orders.flodesk.count.value

    rows.push({
      label: 'Orders from list members',
      value: formatInteger(listOrders),
      kind: 'total',
      share: null,
      change: null,
      polarity: 'up-good',
    })

    for (const key of ['mailchimp', 'flodesk'] as const) {
      const { count } = report.orders[key]
      rows.push({
        label: LEAD_SOURCE_LABELS[key],
        value: formatInteger(count.value),
        kind: 'part',
        share: listOrders ? count.value / listOrders : 0,
        change: count.deltaPct,
        ...formatComparison(count, formatInteger),
        polarity: 'up-good',
      })
    }

    return rows
  }, [report])

  /**
   * Cost per Facebook lead.
   *
   * Struck against Meta's whole spend, which is the honest reading available:
   * the sheet names the campaign a lead came from but the ad platform reports
   * spend by campaign under different identifiers, so apportioning it would be
   * a guess dressed as arithmetic. Said outright in the footnote rather than
   * left for the reader to assume it is lead-ads spend alone.
   */
  const costPerLead = useMemo(() => {
    const leads = report?.sources.facebook.count.value ?? 0
    const spend = meta?.spend.value ?? null
    if (!leads || spend === null) return null
    return spend / leads
  }, [report, meta])

  /** Sources whose last row predates the period, so a zero is not a result. */
  const stale = useMemo(() => {
    if (!report) return []
    const cutoff = shiftDay(range.end, -STALE_AFTER_DAYS)
    return LEAD_SOURCES.filter((key) => {
      const last = report.lastSeen[key]
      return last !== null && last < cutoff && last < range.start
    })
  }, [report, range])

  /**
   * Every source added up, and the same over the comparison window.
   *
   * The baseline is null unless every source carries one. Summing the two that
   * do and comparing that against three sources' worth of this period would
   * report growth that is really just a source appearing.
   */
  const totals = useMemo(() => {
    if (!report) return null
    const current = LEAD_SOURCES.reduce(
      (sum, key) => sum + report.sources[key].count.value,
      0,
    )
    const priors = LEAD_SOURCES.map((key) => report.sources[key].count.previous)
    const previous = priors.every((p) => p !== null && p !== undefined)
      ? (priors as number[]).reduce((sum, p) => sum + p, 0)
      : null
    return { current, previous }
  }, [report])

  /**
   * Leads a day, and what it was a day over the window before.
   *
   * A total answers "how many"; only the rate answers "is this normal", which
   * is the question a lead count is actually read for — and it is the one
   * figure here that survives a change in the length of the period.
   */
  const perDay = useMemo(() => {
    if (!totals) return null
    const priorDays = against ? daysInRange(against) : null
    const before =
      totals.previous === null || priorDays === null
        ? null
        : totals.previous / priorDays
    const now = totals.current / days
    return { now, before, change: before === null ? null : deltaPct(now, before) }
  }, [totals, days, against])

  /**
   * Exactly the figures this section is rendering, posted as they stand.
   *
   * The report is sent whole rather than re-summarised: it is already totals
   * and daily counts with no name, address or order id in it, and a second
   * summary written for the model is a second thing that can drift from the
   * card. Meta's spend rides along because cost per lead cannot be checked
   * without it, and `lastSeen` because a stopped automation is the finding
   * most worth making.
   */
  const snapshotOf = (): Record<string, unknown> => ({
    range,
    days,
    currency: 'USD',
    leads: report ?? null,
    // The rate as well as the total: a period of a different length makes the
    // totals incomparable, and this is the figure that survives that.
    leadsPerDay: perDay?.now ?? null,
    leadsPerDayPrevious: perDay?.before ?? null,
    leadsPerDayDeltaPct: perDay?.change ?? null,
    costPerFacebookLead: costPerLead,
    metaSpend: meta?.spend.value ?? null,
    metaSpendDeltaPct: meta?.spend.deltaPct ?? null,
    // Named rather than left for the model to infer from a run of zeroes.
    sourcesNotWriting: stale,
  })

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel size="lg" glyph={<UserPlus size={16} className="text-muted" />}>
          Leads
        </SectionLabel>
        {/* On the title row, as the CEO Dashboard's is: the review is about
            the whole section, not about whichever card it sits nearest. */}
        <div className="mb-3 flex shrink-0 items-center gap-1">
          <AnalyseButton
            open={analysisOpen}
            onRun={() => analysis.onAnalyse(analysis.prompt ?? '', snapshotOf())}
            hasResult={!!analysis.result}
            panelId={analysisId}
            label="leads"
            onToggle={() => setAnalysisOpen((current) => !current)}
            running={analysis.running}
            disabled={loading}
          />
        </div>
      </div>

      <SectionAnalysis
        onToggle={() => setAnalysisOpen((current) => !current)}
        section="leads"
        label="Leads"
        open={analysisOpen}
        panelId={analysisId}
        prompt={analysis.prompt}
        onSavePrompt={analysis.onSavePrompt}
        savingPrompt={analysis.savingPrompt}
        promptError={analysis.promptError}
        onAnalyse={(prompt) => analysis.onAnalyse(prompt, snapshotOf())}
        running={analysis.running}
        result={analysis.result}
        analysisError={analysis.analysisError}
      />

      {/* A tab whose whole subject is an automation should say when that
          automation stopped. A count of zero and a scenario that died look
          identical otherwise, and the second is the one worth knowing. */}
      {stale.length > 0 && report && (
        <div className="card flex gap-2.5 border-amber-500/30">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-400" />
          <div className="min-w-0 text-[12.5px] leading-relaxed">
            <p className="font-medium text-ink">
              {stale.length === 1
                ? `${LEAD_SOURCE_LABELS[stale[0]]} has written nothing since ${formatDay(
                    report.lastSeen[stale[0]] as string,
                  )}`
                : 'Some sources have stopped writing'}
            </p>
            <p className="mt-0.5 text-muted">
              {stale
                .map(
                  (key) =>
                    `${LEAD_SOURCE_LABELS[key]} last wrote a row on ${formatDay(
                      report.lastSeen[key] as string,
                    )}`,
                )
                .join('; ')}
              . Their zero below is the automation not running, not a period
              without leads — check the Make.com scenario behind it before
              reading anything into the figure.
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-3 h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-3/5" />
        </div>
      ) : (
        <>
          {/* Three figures: the deduplicated email-contact total, how fast
              every capture source is producing leads, and what Facebook leads
              cost. The rate survives a change in period length, so it earns a
              box of its own rather than a line of small print under the total. */}
          {report && totals && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Headline
                label="Unique contacts"
                value={formatInteger(report.uniqueContacts.count.value)}
                change={report.uniqueContacts.count.deltaPct}
                note="Mailchimp + Flodesk, deduplicated by email"
              />
              <Headline
                label="Captured leads / day"
                value={perDay === null ? '—' : formatDecimal(perDay.now)}
                change={perDay?.change ?? null}
                note={
                  perDay?.before == null
                    ? 'No comparison window'
                    : `${formatDecimal(perDay.before)} a day before`
                }
              />
              <Headline
                label="Cost per Facebook lead"
                value={costPerLead === null ? '—' : formatCurrency(costPerLead)}
                note={
                  costPerLead === null
                    ? 'No lead-ads rows, or Meta did not report'
                    : "Meta's whole spend, not lead ads alone"
                }
              />
            </div>
          )}

          <RowsCard
            title="Where the leads came from"
            icon={Mail}
            rows={sourceRows}
            unavailable={failed ? 'Leads unavailable' : null}
          />

          <LeadsOverTime
            data={report?.series ?? []}
            unavailable={failed ? 'Leads unavailable' : undefined}
          />

          <RowsCard
            title="What the lists sold"
            icon={UserPlus}
            rows={valueRows}
            unavailable={failed ? 'Leads unavailable' : null}
            subtitle="Orders placed by people on a list, counted on the order's own date."
          />

          {report && report.campaigns.length > 0 && (
            <RowsCard
              title="Lead ads by campaign"
              icon={Megaphone}
              rows={campaignRows(report)}
              subtitle="Facebook lead-ads captures in this period, largest first."
            />
          )}
        </>
      )}
    </section>
  )
}

function campaignRows(report: LeadReport): StatRowData[] {
  const total = report.campaigns.reduce((sum, row) => sum + row.leads, 0)

  return [
    {
      label: 'Facebook lead ads',
      value: formatInteger(total),
      kind: 'total' as const,
      share: null,
      change: null,
      polarity: 'up-good' as const,
    },
    ...report.campaigns.map((row) => ({
      label: row.name,
      value: formatInteger(row.leads),
      kind: 'part' as const,
      share: total ? row.leads / total : 0,
      // No baseline per campaign: the sheet carries no comparison window of
      // its own, and a campaign that did not run last period would read as a
      // collapse rather than as absent.
      change: null,
      polarity: 'up-good' as const,
    })),
  ]
}

/** A big box, matching the pair that leads the CEO Dashboard. */
function Headline({
  label,
  value,
  note,
  change = null,
}: {
  label: string
  value: string
  note: string
  /** Percentage against the comparison window, where the figure has one. */
  change?: number | null
}) {
  return (
    <div className="min-w-0 rounded-lg border border-btn-border px-3 py-2.5">
      <div className="truncate text-[10.5px] uppercase tracking-wide text-label">
        {label}
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="truncate text-[24px] font-semibold leading-tight tabular-nums text-ink">
          {value}
        </span>
        {change !== null && (
          <span
            className={`flex items-center gap-0.5 text-[11px] tabular-nums ${
              change === 0 ? 'text-muted' : change > 0 ? 'text-pos' : 'text-neg'
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
      <div className="mt-0.5 text-[11px] text-label">{note}</div>
    </div>
  )
}

/** `yyyy-MM-dd` shifted by whole days, in UTC. */
function shiftDay(day: string, by: number): string {
  const at = Date.parse(`${day}T00:00:00Z`)
  if (!Number.isFinite(at)) return day
  return new Date(at + by * 86_400_000).toISOString().slice(0, 10)
}

export type { StatRowData }
