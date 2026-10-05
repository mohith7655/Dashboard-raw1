import { useMemo } from 'react'
import { Info, Layers, Send } from 'lucide-react'
import type { FlodeskReport } from '../../lib/types'
import { formatDay, formatInteger, formatPercent } from '../../lib/format'
import { RowsCard } from '../RowsCard'
import { SectionLabel } from '../SectionLabel'
import type { StatRowData } from '../StatRows'
import { Skeleton } from '../Skeleton'

interface FlodeskCardProps {
  report: FlodeskReport | undefined
  loading: boolean
  failed: boolean
}

/**
 * Flodesk, at the size its API allows.
 *
 * Set below Mailchimp on the same tab rather than given one of its own,
 * because it answers a strictly smaller question and a tab of its own would
 * promise more than arrives. Flodesk publishes no reporting endpoint: there
 * are subscribers, segments and a list of campaign names, and nothing that
 * says whether any of those campaigns worked.
 *
 * The gap is stated on the card rather than left for the reader to notice.
 * Two email providers side by side, one showing open rates and one not, reads
 * as a broken connector unless it says why.
 */
export function FlodeskCard({ report, loading, failed }: FlodeskCardProps) {
  const segmentRows = useMemo((): StatRowData[] => {
    if (!report || !report.subscriberHistoryAvailable) return []

    // Segments overlap — a subscriber can sit in several — so they are shown
    // against the active list rather than summed into a total of their own.
    // A "total" row here would exceed the list it divides.
    return report.segments.map((s) => ({
      label: s.name,
      value: formatInteger(s.members),
      kind: 'part' as const,
      share: report.subscribers.active ? s.members / report.subscribers.active : 0,
      change: null,
      polarity: 'up-good' as const,
    }))
  }, [report])

  if (loading) {
    return (
      <div className="card">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-3 h-3 w-full" />
      </div>
    )
  }

  if (failed || !report) {
    return <div className="card text-[13px] text-muted">Flodesk unavailable</div>
  }

  const { subscribers } = report
  const unsubShare = subscribers.total ? subscribers.unsubscribed / subscribers.total : 0

  return (
    <section className="flex flex-col gap-4">
      <SectionLabel glyph={<Send size={14} className="text-muted" />}>
        Flodesk
      </SectionLabel>

      {/*
        Said first, because every figure under it is smaller than the reader
        will be expecting from the Mailchimp section directly above.
      */}
      <div className="card flex gap-2.5">
        <Info size={15} className="mt-0.5 shrink-0 text-muted" />
        <div className="min-w-0 text-[12.5px] leading-relaxed">
          <p className="font-medium text-ink">
            Flodesk publishes no engagement data
          </p>
          <p className="mt-0.5 text-muted">
            Its API returns subscribers, segments and a list of campaigns — and
            for each campaign only a name, a status and two timestamps. There is
            no opens, clicks or recipient count anywhere in it, and no reporting
            endpoint to ask. So this section is list health and a send log; the
            open and click rates above are Mailchimp&apos;s alone. What Flodesk
            subscribers went on to buy is on the Lead Data tab, counted from the
            Make.com sheet. Subscriber counts below follow the selected dates by
            the date Flodesk created each contact.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Figure
          label="Created in Flodesk"
          value={report.subscriberHistoryAvailable ? formatInteger(subscribers.total) : 'Unavailable'}
          note="during selected period"
        />
        <Figure
          label="Active"
          value={report.subscriberHistoryAvailable ? formatInteger(subscribers.active) : 'Unavailable'}
          note={report.subscriberHistoryAvailable ? `${formatPercent(
            subscribers.total ? subscribers.active / subscribers.total : 0,
          )} of created contacts (current status)` : 'Selected range is too broad'}
        />
        <Figure
          label="Unsubscribed"
          value={report.subscriberHistoryAvailable ? formatInteger(subscribers.unsubscribed) : 'Unavailable'}
          note={report.subscriberHistoryAvailable ? `${formatPercent(unsubShare)} of created contacts (current status)` : 'Selected range is too broad'}
        />
      </div>

      <RowsCard
        title="Segments"
        icon={Layers}
        rows={segmentRows}
        subtitle="Active contacts created in this period, grouped by their current segments. Membership can change later and segments overlap."
        unavailable={report.subscriberHistoryAvailable
          ? null
          : 'Flodesk history is too large to scan for this date range. Narrow the selected dates.'}
      />

      <RowsCard
        title="Campaigns sent"
        icon={Send}
        rows={report.campaigns.map((c) => ({
          label: c.subject || c.name,
          value: formatDay(c.updatedAt.slice(0, 10)),
          kind: 'part' as const,
          share: null,
          change: null,
          polarity: 'neutral' as const,
        }))}
        subtitle="Completed campaigns last touched in this period."
        unavailable={
          report.campaigns.length === 0
            ? report.lastCampaignAt
              ? `No Flodesk campaigns in this period. The most recent of the ${formatInteger(
                  report.campaignsAllTime,
                )} on the account was ${formatDay(report.lastCampaignAt.slice(0, 10))}.`
              : 'No completed Flodesk campaigns on the account.'
            : null
        }
      />
    </section>
  )
}

/** Matches the boxes on the Mailchimp strip above, without the delta — none of
 *  these figures has a comparison window to carry one. */
function Figure({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note: string
}) {
  return (
    <div className="min-w-0 rounded-lg border border-btn-border px-3 py-2.5">
      <div className="truncate text-[10.5px] uppercase tracking-wide text-label">
        {label}
      </div>
      <div className="mt-1 truncate text-[24px] font-semibold leading-tight tabular-nums text-ink">
        {value}
      </div>
      <div className="mt-0.5 truncate text-[11px] text-label">{note}</div>
    </div>
  )
}
