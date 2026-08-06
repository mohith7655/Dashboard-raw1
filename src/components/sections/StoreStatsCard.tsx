import { Users } from 'lucide-react'
import type { DateRange, WooMetrics } from '../../lib/types'
import { daysInRange } from '../../lib/dateRange'
import { deltaPct, failedOrderCount } from '../../lib/derive'
import { formatCurrency, formatInteger } from '../../lib/format'
import { StatRows, type StatRowData } from '../StatRows'
import { Skeleton } from '../Skeleton'

interface StoreStatsCardProps {
  metrics: WooMetrics | undefined
  /** The selected period, for the figures measured per day of it. */
  range: DateRange
  /** The window those are compared against, or null when comparison is off. */
  against: DateRange | null
  loading: boolean
  failed: boolean
}

/**
 * Who bought and how often, in the statement's own grammar.
 *
 * These were four KPI tiles under the statement, which made the section read
 * as a document followed by a scoreboard of the same period. Set as rows they
 * carry the same columns — figure, share, change — and the eye reads down one
 * column instead of hopping between cards.
 */
export function StoreStatsCard({
  metrics,
  range,
  against,
  loading,
  failed,
}: StoreStatsCardProps) {
  const rows = metrics ? buildRows(metrics, range, against) : []

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <div className="kpi-label truncate">Orders and customers</div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-icon-btn text-muted">
          <Users size={15} strokeWidth={2} />
        </span>
      </div>

      {loading ? (
        <div className="mt-3 flex flex-col gap-2 border-t border-row-line pt-3">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-full" />
        </div>
      ) : failed || rows.length === 0 ? (
        <p className="mt-3 border-t border-row-line pt-3 text-[12px] text-muted">
          Store data unavailable for this period.
        </p>
      ) : (
        <StatRows rows={rows} />
      )}
    </div>
  )
}

function buildRows(
  metrics: WooMetrics,
  range: DateRange,
  against: DateRange | null,
): StatRowData[] {
  const total = (
    label: string,
    value: string,
    change: number | null,
  ): StatRowData => ({ label, value, kind: 'total', share: null, change })

  const part = (
    label: string,
    count: number,
    of: number,
    change: number | null,
  ): StatRowData => ({
    label,
    value: formatInteger(count),
    kind: 'part',
    share: of ? count / of : 0,
    change,
  })

  // Per day of the period, and compared against the other window's own length.
  // The two are equal under the default comparison but not under "same month
  // last year", where one divisor for both would report growth that never was.
  const was = metrics.pnlPrevious
  const perDay = metrics.totalRevenue.value / daysInRange(range)
  const perDayBefore = was && against ? was.totalRevenue / daysInRange(against) : null

  const buyers = metrics.totalCustomers.value
  // Against every order placed, not against the paid ones the row above counts
  // — a failed order is precisely one that never joined them.
  const placed = metrics.orderCount
  const failed = failedOrderCount(metrics) ?? 0

  return [
    total('Customers', formatInteger(buyers), metrics.totalCustomers.deltaPct),
    part('New', metrics.newCustomers.value, buyers, metrics.newCustomers.deltaPct),
    part(
      'Returning',
      metrics.returningCustomers.value,
      buyers,
      metrics.returningCustomers.deltaPct,
    ),
    total('Total orders', formatInteger(metrics.totalOrders.value), metrics.totalOrders.deltaPct),
    // No delta: the status counts are only kept for the selected period, so
    // there is nothing to measure this against rather than nothing to report.
    { ...part('Failed', failed, placed, null), polarity: 'down-good' },
    total(
      'Avg order value',
      formatCurrency(metrics.avgOrderValue.value),
      metrics.avgOrderValue.deltaPct,
    ),
    total(
      'Avg sales per day',
      formatCurrency(perDay),
      perDayBefore === null ? null : deltaPct(perDay, perDayBefore),
    ),
  ]
}
