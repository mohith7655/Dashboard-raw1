import { AlertTriangle, CheckCircle2, PackageCheck, XCircle } from 'lucide-react'
import type { FeedIssue, MerchantFeed } from '../../lib/types'
import { formatInteger, formatPercent } from '../../lib/format'
import { Pill, PILL_COLORS } from '../Pill'
import { StatRows, type StatRowData } from '../StatRows'
import { Skeleton } from '../Skeleton'

interface MerchantFeedCardProps {
  feed: MerchantFeed | undefined
  loading: boolean
  error: string | null
}

/** How Merchant Center grades an issue, and what it costs. */
const SERVABILITY: Record<string, { color: string; label: string }> = {
  disapproved: { color: PILL_COLORS.red, label: 'Not serving' },
  demoted: { color: PILL_COLORS.amber, label: 'Demoted' },
  unaffected: { color: PILL_COLORS.grey, label: 'Advisory' },
}

/**
 * Whether the catalogue behind the Shopping ads is actually serving.
 *
 * Google Ads reports what the Shopping campaigns spent. It does not report that
 * a hundred items went disapproved on Tuesday over a price mismatch — and that
 * is the fact which explains a Shopping campaign whose impressions fell while
 * its budget did not.
 */
export function MerchantFeedCard({ feed, loading, error }: MerchantFeedCardProps) {
  if (loading) {
    return (
      <div className="card">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-3 h-3 w-full" />
        <Skeleton className="mt-2 h-3 w-2/3" />
      </div>
    )
  }

  if (error || !feed) {
    return (
      <div className="card">
        <h3 className="text-[15px] font-semibold text-ink">Product feed</h3>
        <p className="mt-2 text-[13px] text-muted">
          {error ?? 'Merchant Center data unavailable.'}
        </p>
      </div>
    )
  }

  const { active, pending, disapproved, expiring } = feed.totals
  const total = active + pending + disapproved + expiring
  const healthy = total > 0 && disapproved === 0 && feed.websiteClaimed

  const rows: StatRowData[] = [
    { label: 'Items in feed', value: formatInteger(total), kind: 'total', share: null, change: null },
    {
      label: 'Active',
      value: formatInteger(active),
      kind: 'part',
      share: total ? active / total : 0,
      change: null,
    },
    {
      label: 'Disapproved',
      value: formatInteger(disapproved),
      kind: 'part',
      share: total ? disapproved / total : 0,
      change: null,
      polarity: 'down-good',
    },
    {
      label: 'Pending',
      value: formatInteger(pending),
      kind: 'part',
      share: total ? pending / total : 0,
      change: null,
    },
    {
      // Not a failure yet, which is exactly why it is worth seeing: an expiring
      // item is one nobody has re-submitted, and it stops serving on its own.
      label: 'Expiring',
      value: formatInteger(expiring),
      kind: 'part',
      share: total ? expiring / total : 0,
      change: null,
      polarity: 'down-good',
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="card">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="kpi-label truncate">Product feed</div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="kpi-value">{formatInteger(active)}</span>
              <span className="text-[12px] text-muted">
                serving of {formatInteger(total)}
                {total > 0 && ` · ${formatPercent(active / total)}`}
              </span>
            </div>
            <p className="mt-1 text-[12px] text-muted">
              Merchant Center account {feed.merchantId}
              {!feed.websiteClaimed && (
                <span className="text-neg">
                  {' '}
                  — the website is not claimed, so nothing can serve.
                </span>
              )}
            </p>
          </div>
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-icon-btn ${
              healthy ? 'text-pos' : disapproved > 0 ? 'text-neg' : 'text-muted'
            }`}
          >
            {healthy ? (
              <CheckCircle2 size={15} strokeWidth={2} />
            ) : disapproved > 0 ? (
              <XCircle size={15} strokeWidth={2} />
            ) : (
              <PackageCheck size={15} strokeWidth={2} />
            )}
          </span>
        </div>

        <StatRows rows={rows} />
      </div>

      {feed.accountIssues.length > 0 && (
        <div className="card border-[#ef444455]">
          <h3 className="flex items-center gap-2 text-[14px] font-medium text-ink">
            <AlertTriangle size={15} className="text-neg" />
            Account issues
          </h3>
          <ul className="mt-2.5 flex flex-col gap-2.5">
            {feed.accountIssues.map((issue) => (
              <li key={issue.title}>
                <p className="text-[13px] text-ink">{issue.title}</p>
                {issue.detail && (
                  <p className="mt-0.5 max-w-prose text-[12px] leading-relaxed text-muted">
                    {issue.detail}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card p-0">
        <div className="px-5 pb-4 pt-5">
          <h3 className="text-[15px] font-semibold text-ink">Item issues</h3>
          <p className="mt-0.5 max-w-prose text-[12px] leading-relaxed text-muted">
            Worst first: an issue that stops items serving outranks one that only
            demotes them. The count is the products affected, taken as the worst
            single destination rather than summed across them — the same product
            is reported once per destination, and adding those up would count it
            several times over.
          </p>
        </div>

        {feed.issues.length === 0 ? (
          <p className="px-5 pb-6 text-[13px] text-muted">
            No item-level issues reported. Every item in the feed is serving as
            submitted.
          </p>
        ) : (
          <ul className="flex flex-col">
            {feed.issues.map((issue) => (
              <IssueRow key={issue.code} issue={issue} />
            ))}
          </ul>
        )}
      </div>

      {feed.destinations.length > 1 && (
        <p className="text-[12px] leading-relaxed text-muted">
          Counted across {feed.destinations.length} destination and country
          combinations:{' '}
          {feed.destinations
            .map((d) => `${d.destination}${d.country ? ` (${d.country})` : ''}`)
            .join(', ')}
          .
        </p>
      )}
    </div>
  )
}

function IssueRow({ issue }: { issue: FeedIssue }) {
  const grade = SERVABILITY[issue.servability] ?? SERVABILITY.unaffected

  return (
    <li className="border-t border-row-line px-5 py-3 first:border-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 text-[13px] text-ink">{issue.description}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          <Pill color={grade.color}>{grade.label}</Pill>
          <span className="text-[12px] tabular-nums text-muted">
            {formatInteger(issue.affected)} items
          </span>
        </div>
      </div>
      {issue.detail && (
        <p className="mt-1 max-w-prose text-[12px] leading-relaxed text-muted">
          {issue.detail}
        </p>
      )}
    </li>
  )
}
