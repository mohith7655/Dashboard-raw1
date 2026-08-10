import { Truck } from 'lucide-react'
import type { CostSlice } from '../../lib/pnl'
import type { Metric } from '../../lib/types'
import { formatCurrency, formatPercent, formatPrevious } from '../../lib/format'
import { StatRows, type StatRowData } from '../StatRows'
import { Skeleton } from '../Skeleton'

interface ShippingStatsCardProps {
  /** What the orders themselves carried. */
  orderCost: number
  /** Hand-entered surcharges resolved onto the period. */
  extraCost: number
  /** Its delta, which only the order side has a comparison for. */
  costMetric: Metric | undefined
  orders: number
  revenue: number
  /** Product, shipping and transaction, for the mix rows. */
  mix: CostSlice[]
  totalCost: number
  loading: boolean
  failed: boolean
}

/**
 * What shipping cost, in the statement's row grammar.
 *
 * These were four tiles and a stacked bar, which made the tab read as a
 * scoreboard followed by a chart of the same period. Set as rows they carry
 * the same columns the statement does — figure, share, change — and the eye
 * reads down one column instead of hopping between cards.
 */
export function ShippingStatsCard({
  orderCost,
  extraCost,
  costMetric,
  orders,
  revenue,
  mix,
  totalCost,
  loading,
  failed,
}: ShippingStatsCardProps) {
  const rows = buildRows({
    orderCost,
    extraCost,
    costMetric,
    orders,
    revenue,
    mix,
    totalCost,
  })

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <div className="kpi-label truncate">Shipping costs</div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-icon-btn text-muted">
          <Truck size={15} strokeWidth={2} />
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
          Shipping data unavailable for this period.
        </p>
      ) : (
        <StatRows rows={rows} />
      )}
    </div>
  )
}

function buildRows({
  orderCost,
  extraCost,
  costMetric,
  orders,
  revenue,
  mix,
  totalCost,
}: Omit<ShippingStatsCardProps, 'loading' | 'failed'>): StatRowData[] {
  const total = orderCost + extraCost
  if (total === 0 && orders === 0) return []

  const rows: StatRowData[] = []
  const down = 'down-good' as const

  rows.push({
    label: 'Total shipping cost',
    value: formatCurrency(total),
    kind: 'total',
    // Its own 100%: the parts below split it, and the ratios further down are
    // measured against other things entirely.
    share: null,
    change: costMetric?.deltaPct ?? null,
    previous: costMetric ? formatPrevious(costMetric, formatCurrency) : undefined,
    polarity: down,
  })
  rows.push({
    label: 'Carrier cost',
    value: formatCurrency(orderCost),
    kind: 'part',
    share: total === 0 ? 0 : orderCost / total,
    change: costMetric?.deltaPct ?? null,
    // The metric behind both rows is the carrier cost, so this is its baseline
    // and the total's above it only where no extra costs were entered.
    previous: costMetric ? formatPrevious(costMetric, formatCurrency) : undefined,
    polarity: down,
  })
  // Only where some exist. A store that has entered none should not have to
  // read a zero to find that out.
  if (extraCost > 0) {
    rows.push({
      label: 'Extra costs',
      value: formatCurrency(extraCost),
      kind: 'part',
      share: total === 0 ? 0 : extraCost / total,
      // Entered by hand and prorated onto whatever range is on screen, so
      // there is no prior figure to measure it against.
      change: null,
      polarity: down,
    })
  }

  if (orders > 0) {
    rows.push({
      label: 'Per order',
      value: formatCurrency(total / orders),
      kind: 'total',
      share: null,
      change: null,
      polarity: down,
    })
  }

  rows.push({
    label: 'Share of revenue',
    value: revenue === 0 ? '—' : formatPercent(total / revenue),
    kind: 'total',
    share: null,
    change: null,
    polarity: down,
  })

  // Where the whole cost base goes, shipping among it — the stacked bar this
  // replaces, said as rows. Measured against total cost, not against the
  // shipping figure above, so the three add to one.
  if (totalCost > 0 && mix.some((slice) => slice.amount > 0)) {
    rows.push({
      label: 'All costs',
      value: formatCurrency(totalCost),
      kind: 'total',
      share: null,
      change: null,
      polarity: down,
    })
    for (const slice of mix) {
      rows.push({
        label: slice.label,
        value: formatCurrency(slice.amount),
        kind: 'part',
        share: slice.share,
        change: null,
        polarity: down,
      })
    }
  }

  return rows
}
