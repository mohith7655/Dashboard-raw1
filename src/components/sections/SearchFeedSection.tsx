import type { GscDimension, GscReport, MerchantFeed } from '../../lib/types'
import { formatDay } from '../../lib/format'
import { SectionLabel } from '../SectionLabel'
import { SearchClicksImpressions } from '../charts/SearchClicksImpressions'
import { SearchConsoleCard } from './SearchConsoleCard'
import { MerchantFeedCard } from './MerchantFeedCard'

interface SearchFeedSectionProps {
  report: GscReport | undefined
  dimension: GscDimension
  onDimensionChange: (dimension: GscDimension) => void
  loading: boolean
  fetching: boolean
  error: string | null
  feed: MerchantFeed | undefined
  feedLoading: boolean
  feedError: string | null
  /** The selected period's last day, to say whether Search Console has caught up to it. */
  rangeEnd: string
}

/**
 * The two Google surfaces the store appears on before anybody clicks: the
 * search results, and the Shopping listings behind them.
 *
 * Kept as one tab because they answer halves of the same question. Search
 * Console says how often the store was shown and how often that turned into a
 * visit; Merchant Center says whether the products were eligible to be shown at
 * all. A drop in the first with no explanation is very often the second.
 */
export function SearchFeedSection({
  report,
  dimension,
  onDimensionChange,
  loading,
  fetching,
  error,
  feed,
  feedLoading,
  feedError,
  rangeEnd,
}: SearchFeedSectionProps) {
  // Search Console finalises two to three days behind. Named only when it
  // actually matters — the last days of the selected range being empty is the
  // most common misreading of this report, and a caveat printed every time
  // would be ignored by the time it was true.
  const lagging =
    report?.freshestDate && report.freshestDate < rangeEnd ? report.freshestDate : null

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div>
          <SectionLabel>Organic Search</SectionLabel>
          <p className="mt-1 max-w-prose text-[12px] leading-relaxed text-muted">
            What Google showed and what it earned, before any of it reached
            analytics. GA4 counts the visit; only this counts the impression that
            never became one, the query behind it, and the rank that decided.
            {lagging && (
              <span className="text-ink">
                {' '}
                Data runs to {formatDay(lagging)} — Search Console finalises two
                to three days late, so the end of this range is still filling in.
              </span>
            )}
          </p>
        </div>

        <SearchConsoleCard
          report={report}
          dimension={dimension}
          onDimensionChange={onDimensionChange}
          loading={loading}
          fetching={fetching}
          error={error}
        />

        <SearchClicksImpressions
          data={report?.series ?? []}
          loading={loading}
          unavailable={error ?? undefined}
          freshestDate={report?.freshestDate}
        />
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <SectionLabel>Product Feed</SectionLabel>
          <p className="mt-1 max-w-prose text-[12px] leading-relaxed text-muted">
            Whether the catalogue behind the Shopping ads is eligible to serve.
            The spend on the Ad Spend tab buys nothing for an item Merchant
            Center has disapproved.
          </p>
        </div>

        <MerchantFeedCard feed={feed} loading={feedLoading} error={feedError} />
      </div>
    </section>
  )
}
