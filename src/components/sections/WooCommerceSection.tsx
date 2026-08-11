import type { DateRange, WooMetrics } from '../../lib/types'
import { SectionLabel } from '../SectionLabel'
import { StoreStatsCard } from './StoreStatsCard'

interface WooCommerceSectionProps {
  metrics: WooMetrics | undefined
  loading: boolean
  failed: boolean
  /** The selected period, for the figures measured per day of it. */
  range: DateRange
  /** The window those are compared against, or null when comparison is off. */
  against: DateRange | null
  /** Leads the section, above the store figures — the statement in full. */
  summary?: React.ReactNode
  /**
   * Between the statement and the store figures.
   *
   * Where the advertising sits: it is what the statement's costliest line was
   * spent on, and it reads before the order counts because those are the thing
   * the spend was meant to produce.
   */
  beforeStats?: React.ReactNode
  /**
   * Closes the section, below the store figures.
   *
   * Its own slot rather than a second child of `summary`, so the order the
   * cards read in is stated here instead of depending on how the caller
   * happened to nest them.
   */
  footer?: React.ReactNode
}

/**
 * The statement, then who bought and how often — both as rows rather than one
 * document above a row of tiles restating it.
 *
 * The KPI grid that stood here held total sales, customers, average order
 * value and total orders, and below them the costs and profit the statement
 * already carried line by line. Total sales was on it twice, and its own copy
 * disagreed with the statement's by the discounts.
 */
export function WooCommerceSection({
  metrics,
  loading,
  failed,
  range,
  against,
  summary,
  beforeStats,
  footer,
}: WooCommerceSectionProps) {
  return (
    <section>
      <SectionLabel>CEO Dashboard</SectionLabel>

      {/* Statement, then what was spent to fill it, then who bought, then what
          was given away to make them buy. The order counts read after the
          advertising because they are what the advertising was meant to
          produce; the coupons that discounted them are a footnote to all three
          and read last. */}
      <div className="flex flex-col gap-4">
        {summary}
        {beforeStats}
        <StoreStatsCard
          metrics={metrics}
          range={range}
          against={against}
          loading={loading}
          failed={failed}
        />
        {footer}
      </div>
    </section>
  )
}
