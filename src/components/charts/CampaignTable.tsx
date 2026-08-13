import type { ReactNode } from 'react'
import type { MailchimpBenchmark, MailchimpCampaign } from '../../lib/types'
import { formatCtr, formatDay, formatInteger, formatPercent } from '../../lib/format'
import { Skeleton } from '../Skeleton'

/** Past this the card scrolls rather than pushing the page down. */
const MAX_BODY = 'max-h-[480px]'

interface CampaignTableProps {
  campaigns: MailchimpCampaign[]
  /** Rates below the sector average are marked against this. */
  benchmark: MailchimpBenchmark | null
  loading?: boolean
  unavailable?: string
}

/**
 * Every send in the period, newest first.
 *
 * The full list rather than a top-N: these go out in batches of seven, one per
 * audience, and the one worth finding is the audience that did not respond
 * like the others — which is exactly the row a "top campaigns" cut would drop.
 */
export function CampaignTable({
  campaigns,
  benchmark,
  loading,
  unavailable,
}: CampaignTableProps) {
  return (
    <div className="card p-0">
      <div className="px-5 pb-4 pt-5">
        <h3 className="text-[15px] font-semibold text-ink">Campaigns</h3>
        <p className="mt-0.5 text-[12px] text-muted">
          Every send in the period, most recent first
          {!loading && !unavailable && campaigns.length > 0 && (
            <> · {formatInteger(campaigns.length)} in this period</>
          )}
          {benchmark && (
            <>
              . Rates under the eCommerce average are marked
              <span className="ml-1 text-neg">&darr;</span>
            </>
          )}
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3 px-5 pb-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      ) : unavailable ? (
        <div className="px-5 pb-6 text-[13px] text-muted">{unavailable}</div>
      ) : campaigns.length === 0 ? (
        <div className="px-5 pb-6 text-[13px] text-muted">No sends in this period.</div>
      ) : (
        <div className={`${MAX_BODY} overflow-y-auto overflow-x-auto`}>
          <table className="w-full min-w-[720px] border-collapse text-[13px]">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-line text-left">
                <Th className="pl-5">Campaign</Th>
                <Th align="right">Sent</Th>
                <Th align="right">Opens</Th>
                <Th align="right">Open rate</Th>
                <Th align="right">Clicks</Th>
                <Th align="right">Click rate</Th>
                <Th align="right" className="pr-5">
                  Unsub
                </Th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-b border-row-line last:border-0">
                  <Td className="pl-5">
                    <div className="min-w-0 max-w-[280px]">
                      <div className="truncate text-ink" title={c.title}>
                        {c.title}
                      </div>
                      <div className="truncate text-[11.5px] text-label">
                        {c.listName}
                        {c.listName && ' · '}
                        {formatDay(c.sentAt.slice(0, 10))}
                      </div>
                    </div>
                  </Td>
                  <Td align="right" className="tabular-nums text-muted">
                    {formatInteger(c.emailsSent)}
                  </Td>
                  <Td align="right" className="tabular-nums text-muted">
                    {formatInteger(c.uniqueOpens)}
                  </Td>
                  <Td align="right" className="tabular-nums text-ink">
                    <Rate
                      value={formatPercent(c.openRate)}
                      under={benchmark ? c.openRate < benchmark.openRate : false}
                    />
                  </Td>
                  <Td align="right" className="tabular-nums text-muted">
                    {formatInteger(c.uniqueClicks)}
                  </Td>
                  <Td align="right" className="tabular-nums text-ink">
                    <Rate
                      value={formatCtr(c.clickRate)}
                      under={benchmark ? c.clickRate < benchmark.clickRate : false}
                    />
                  </Td>
                  <Td align="right" className="pr-5 tabular-nums text-muted">
                    {formatInteger(c.unsubscribed)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/**
 * A rate, marked where it falls under the sector average.
 *
 * The arrow carries a text label for readers who cannot see the colour it is
 * drawn in — the colour alone would be the whole of the signal otherwise.
 */
function Rate({ value, under }: { value: string; under: boolean }) {
  if (!under) return <>{value}</>
  return (
    <span className="inline-flex items-center gap-1">
      {value}
      <span className="text-neg" aria-label="below the eCommerce average">
        &darr;
      </span>
    </span>
  )
}

function Th({
  children,
  align = 'left',
  className = '',
}: {
  children: ReactNode
  align?: 'left' | 'right'
  className?: string
}) {
  return (
    <th
      scope="col"
      className={`px-3 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-label ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${className}`}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  align = 'left',
  className = '',
}: {
  children: ReactNode
  align?: 'left' | 'right'
  className?: string
}) {
  return (
    <td
      className={`h-12 px-3 align-middle ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${className}`}
    >
      {children}
    </td>
  )
}
