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
}: WooCommerceSectionProps) {
  return (
    <section>
      <SectionLabel>CEO Dashboard</SectionLabel>

      <div className="flex flex-col gap-4">
        {summary}
        <StoreStatsCard
          metrics={metrics}
          range={range}
          against={against}
          loading={loading}
          failed={failed}
        />
      </div>
    </section>
  )
}
