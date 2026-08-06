import { ArrowDown, ArrowUp, Users } from 'lucide-react'
import type { DateRange, WooMetrics } from '../../lib/types'
import { daysInRange } from '../../lib/dateRange'
import { deltaPct } from '../../lib/derive'
import {
  formatCurrency,
  formatDeltaPercent,
  formatInteger,
  formatPercent,
} from '../../lib/format'
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

/** A heading figure, or one of the parts that make it up. */
interface Row {
  label: string
  value: string
  kind: 'total' | 'part'
  /** Share of the heading above it, where the parts add up to one. */
  share: number | null
  change: number | null
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
  const anyChange = rows.some((row) => row.change !== null)

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
        // As on the statement: the rows scroll sideways on a narrow screen
        // rather than wrapping a column of figures into unreadable shapes.
        <div className="mt-3 overflow-x-auto border-t border-row-line pt-1">
          <dl className={`flex flex-col ${anyChange ? 'min-w-[23rem]' : 'min-w-[17rem]'}`}>
            {rows.map((row) => (
              <StatRow key={row.label} row={row} showChange={anyChange} />
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}

function buildRows(
  metrics: WooMetrics,
  range: DateRange,
  against: DateRange | null,
): Row[] {
  const total = (label: string, value: string, change: number | null): Row => ({
    label,
    value,
    kind: 'total',
    share: null,
    change,
  })

  const buyers = metrics.totalCustomers.value
  const part = (label: string, count: number, change: number | null): Row => ({
    label,
    value: formatInteger(count),
    kind: 'part',
    share: buyers ? count / buyers : 0,
    change,
  })

  // Per day of the period, and compared against the other window's own length.
  // The two are equal under the default comparison but not under "same month
  // last year", where one divisor for both would report growth that never was.
  const was = metrics.pnlPrevious
  const perDay = metrics.totalRevenue.value / daysInRange(range)
  const perDayBefore = was && against ? was.totalRevenue / daysInRange(against) : null

  return [
    total('Customers', formatInteger(buyers), metrics.totalCustomers.deltaPct),
    part('New', metrics.newCustomers.value, metrics.newCustomers.deltaPct),
    part('Returning', metrics.returningCustomers.value, metrics.returningCustomers.deltaPct),
    total(
      'Avg order value',
      formatCurrency(metrics.avgOrderValue.value),
      metrics.avgOrderValue.deltaPct,
    ),
    total('Total orders', formatInteger(metrics.totalOrders.value), metrics.totalOrders.deltaPct),
    total(
      'Avg sales per day',
      formatCurrency(perDay),
      perDayBefore === null ? null : deltaPct(perDay, perDayBefore),
    ),
  ]
}

/** Every figure here reads better rising, so the colour follows the sign alone. */
const changeColor = (change: number): string =>
  change === 0 ? 'text-muted' : change > 0 ? 'text-pos' : 'text-neg'

function StatRow({ row, showChange }: { row: Row; showChange: boolean }) {
  const total = row.kind === 'total'

  return (
    // Packed to the left, as the statement is: spread across the card, a
    // figure ends up an inch from the label that names it.
    <div
      className={`flex items-baseline gap-2 py-1 ${
        total ? 'border-t border-row-line first:border-0' : ''
      }`}
    >
      <dt
        className={`w-[8.5rem] shrink-0 truncate ${total ? '' : 'pl-3'} ${
          total ? 'text-[12px] font-medium text-ink' : 'text-[11px] text-muted'
        }`}
      >
        {row.label}
      </dt>
      <dd className="flex shrink-0 items-baseline gap-2">
        <span
          className={`min-w-[5.5rem] text-right tabular-nums ${
            total ? 'text-[12px] font-semibold text-ink' : 'text-[11px] text-muted'
          }`}
        >
          {row.value}
        </span>
        {/* Each column holds its width even where a row has no figure for it,
            so one gap cannot shunt the column beside it out of alignment. */}
        <span className="w-12 text-right text-[11px] tabular-nums text-muted">
          {row.share === null ? '' : formatPercent(row.share)}
        </span>
        {showChange && (
          <span
            className={`flex w-[4.5rem] items-center justify-end gap-0.5 text-[11px] tabular-nums ${
              row.change === null ? 'text-muted' : changeColor(row.change)
            }`}
          >
            {row.change !== null && (
              <>
                {row.change < 0 ? (
                  <ArrowDown size={10} strokeWidth={3} />
                ) : (
                  <ArrowUp size={10} strokeWidth={3} />
                )}
                {formatDeltaPercent(row.change)}
              </>
            )}
          </span>
        )}
      </dd>
    </div>
  )
}
