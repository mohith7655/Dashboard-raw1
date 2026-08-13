import { useMemo } from 'react'
import { Mail, MailX, Users } from 'lucide-react'
import type { DateRange, FlodeskReport, MailchimpReport } from '../../lib/types'
import {
  formatCtr,
  formatDay,
  formatInteger,
  formatPercent,
} from '../../lib/format'
import { RowsCard } from '../RowsCard'
import { SectionLabel } from '../SectionLabel'
import type { StatRowData } from '../StatRows'
import { Skeleton } from '../Skeleton'
import { CampaignTable } from '../charts/CampaignTable'
import { EmailEngagement } from '../charts/EmailEngagement'
import { EmailStatsCard } from './EmailStatsCard'
import { FlodeskCard } from './FlodeskCard'

interface EmailSectionProps {
  report: MailchimpReport | undefined
  loading: boolean
  failed: boolean
  range: DateRange
  /**
   * Flodesk, which answers a much smaller question — see `FlodeskCard`. Kept
   * on this tab rather than its own so the two email providers are read
   * together, and the one that cannot report engagement says so beside the one
   * that can.
   */
  flodesk: FlodeskReport | undefined
  flodeskLoading: boolean
  flodeskFailed: boolean
}

/**
 * Email engagement, from Mailchimp.
 *
 * The other half of the Leads tab. That one counts who joined a list and what
 * they bought, from the sheet the Make.com automations write into; this counts
 * what happened to the mail itself — who opened it, who clicked, who left.
 *
 * Revenue is deliberately absent. Mailchimp reports none for this account: its
 * one connected store does not cover the audiences being sent to, so every
 * campaign's e-commerce total is zero. The sheet already carries the orders
 * these lists produced, and the Leads tab already shows them.
 */
export function EmailSection({
  report,
  loading,
  failed,
  range,
  flodesk,
  flodeskLoading,
  flodeskFailed,
}: EmailSectionProps) {
  /** Audiences as they stand, largest first. Not scoped to the period. */
  const audienceRows = useMemo((): StatRowData[] => {
    if (!report) return []

    const total = report.audiences.reduce((sum, a) => sum + a.members, 0)

    return [
      {
        label: 'Subscribers across all audiences',
        value: formatInteger(total),
        kind: 'total',
        share: null,
        change: null,
        polarity: 'up-good',
      },
      ...report.audiences.map((a) => ({
        label: a.name,
        value: formatInteger(a.members),
        kind: 'part' as const,
        share: total ? a.members / total : 0,
        // No baseline per audience: a list's size is a state Mailchimp reports
        // now, not a figure it reports for a window, so there is nothing
        // honest to compare it against.
        change: null,
        polarity: 'up-good' as const,
      })),
    ]
  }, [report])

  /**
   * Which audiences are shrinking.
   *
   * Mailchimp's own monthly averages, set against each other. A list losing
   * more people a month than it gains is the finding a subscriber count cannot
   * make on its own — the count looks large right up until it doesn't.
   */
  const shrinking = useMemo(() => {
    if (!report) return []
    return report.audiences
      .filter((a) => a.unsubsPerMonth > a.subsPerMonth && a.members > 0)
      .sort((a, b) => b.unsubsPerMonth - a.unsubsPerMonth)
  }, [report])

  const empty = !!report && report.campaigns.length === 0

  return (
    <section className="flex flex-col gap-4">
      <SectionLabel size="lg" glyph={<Mail size={16} className="text-muted" />}>
        Email
      </SectionLabel>

      {/* Named, because the tab now carries two senders and only one of them
          reports engagement. Without the label the rates below read as the
          store's email performance rather than as one provider's. */}
      <SectionLabel glyph={<Mail size={14} className="text-muted" />}>
        Mailchimp
      </SectionLabel>

      {loading ? (
        <div className="card">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-3 h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-3/5" />
        </div>
      ) : failed ? (
        <div className="card text-[13px] text-muted">Email engagement unavailable</div>
      ) : (
        <>
          {/*
            A period with no sends in it is an ordinary result for a sender who
            batches campaigns around a holiday, and it is not the same thing as
            a period that went badly. Said outright, with the date of the last
            send, rather than shown as a screen of noughts.
          */}
          {empty && (
            <div className="card">
              <p className="text-[13px] text-ink">No campaigns were sent in this period.</p>
              <p className="mt-1 text-[12.5px] text-muted">
                {report?.lastSendAt
                  ? `The most recent send was ${formatDay(report.lastSendAt.slice(0, 10))}. The audiences below are current, not scoped to the period — a list has a size now, not over a window.`
                  : 'This account has no sends on record.'}
              </p>
            </div>
          )}

          {!empty && report && (
            <>
              <EmailStatsCard report={report} range={range} />

              <EmailEngagement
                campaigns={report.campaigns}
                benchmark={report.benchmark}
              />

              <CampaignTable campaigns={report.campaigns} benchmark={report.benchmark} />
            </>
          )}

          <RowsCard
            title="Audiences"
            icon={Users}
            rows={audienceRows}
            unavailable={failed ? 'Audiences unavailable' : null}
            subtitle="Subscribers on each list as it stands today, largest first. Not scoped to the period."
          />

          {shrinking.length > 0 && (
            <RowsCard
              title="Audiences losing people faster than they gain them"
              icon={MailX}
              rows={shrinking.map((a) => ({
                label: a.name,
                value: `−${formatInteger(a.unsubsPerMonth - a.subsPerMonth)} a month`,
                kind: 'part' as const,
                share: null,
                change: null,
                polarity: 'down-good' as const,
              }))}
              subtitle="Mailchimp's own monthly averages: people leaving set against people joining."
              footnote={
                <p className="mt-3 border-t border-row-line pt-3 text-[12px] text-muted">
                  A subscriber count says how large a list is; these say which
                  way it is heading. Both are Mailchimp&apos;s rolling averages
                  rather than counts for the period on screen, so they do not
                  move with the date picker.
                </p>
              }
            />
          )}

          {/*
            The benchmark is Mailchimp's, not this dashboard's: a sector
            average it attaches to each campaign. Worth stating plainly at the
            foot of the section, because every rate above is marked against it.
          */}
          {report?.benchmark && !empty && (
            <p className="text-[12px] text-muted">
              Mailchimp puts the eCommerce averages at{' '}
              <span className="text-ink">{formatPercent(report.benchmark.openRate)}</span>{' '}
              opens and{' '}
              <span className="text-ink">{formatCtr(report.benchmark.clickRate)}</span>{' '}
              clicks. They are the sector, not this store&apos;s history — a rate
              under them is worth asking about, not a fault on its own.
            </p>
          )}
        </>
      )}

      {/* Outside the Mailchimp branch above: Flodesk is a separate connector
          and a Mailchimp key that has expired must not take it down with it. */}
      <div className="mt-4 border-t border-line pt-6">
        <FlodeskCard
          report={flodesk}
          loading={flodeskLoading}
          failed={flodeskFailed}
        />
      </div>
    </section>
  )
}
