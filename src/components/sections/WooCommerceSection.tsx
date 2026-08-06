import { DollarSign, Package, ShoppingCart, Users } from 'lucide-react'
import type { DateRange, WooMetrics } from '../../lib/types'
import { formatCurrency, formatInteger } from '../../lib/format'
import { daysInRange } from '../../lib/dateRange'
import { deltaPct } from '../../lib/derive'
import { KpiCard, type KpiPart } from '../KpiCard'
import { CardRow } from '../CardRow'
import { SectionLabel } from '../SectionLabel'

interface WooCommerceSectionProps {
  metrics: WooMetrics | undefined
  loading: boolean
  failed: boolean
  /** The selected period, for the figures measured per day of it. */
  range: DateRange
  /** The window those are compared against, or null when comparison is off. */
  against: DateRange | null
  /** Leads the section, above the KPI grid — the statement in full. */
  summary?: React.ReactNode
}

export function WooCommerceSection({
  metrics,
  loading,
  failed,
  range,
  against,
  summary,
}: WooCommerceSectionProps) {
  const shared = { loading, unavailable: failed }

  // What the headline is made of, in the same card. Each is compared against
  // its own figure in the comparison window, which is null when the comparison
  // is off.
  const was = metrics?.pnlPrevious ?? null

  // Per day of the period rather than of the month, and compared against the
  // other window's own length. The two windows are equal under the default
  // comparison but not under "same month last year", and a daily average
  // divided by the wrong number of days would read as growth that never
  // happened.
  const perDay = metrics ? metrics.totalRevenue.value / daysInRange(range) : 0
  const perDayBefore =
    was && against ? was.totalRevenue / daysInRange(against) : null

  const revenueParts: KpiPart[] = metrics
    ? [
        {
          // Named as the statement above names it: this figure is struck after
          // coupons, and "gross sales" there means the line before them.
          label: 'Net sales',
          value: formatCurrency(metrics.pnl.grossSales),
          deltaPct: was ? deltaPct(metrics.pnl.grossSales, was.grossSales) : null,
        },
        {
          label: 'Avg sales per day',
          value: formatCurrency(perDay),
          deltaPct: perDayBefore === null ? null : deltaPct(perDay, perDayBefore),
        },
      ]
    : []

  // These two do add up to the headline, so each carries its share of it, and
  // each already carries its own change from the metric set.
  const buyers = metrics?.totalCustomers.value ?? 0
  const customerParts: KpiPart[] = metrics
    ? [
        {
          label: 'New',
          value: formatInteger(metrics.newCustomers.value),
          share: buyers ? metrics.newCustomers.value / buyers : 0,
          deltaPct: metrics.newCustomers.deltaPct,
        },
        {
          label: 'Returning',
          value: formatInteger(metrics.returningCustomers.value),
          share: buyers ? metrics.returningCustomers.value / buyers : 0,
          deltaPct: metrics.returningCustomers.deltaPct,
        },
      ]
    : []

  return (
    <section>
      <SectionLabel>CEO Dashboard</SectionLabel>

      {summary && <div className="mb-4">{summary}</div>}

      <CardRow>
        <KpiCard
          label="Total Sales"
          value={metrics ? formatCurrency(metrics.totalRevenue.value) : '—'}
          metric={metrics?.totalRevenue}
          icon={DollarSign}
          parts={revenueParts}
          {...shared}
        />
        <KpiCard
          label="Customers"
          value={metrics ? formatInteger(metrics.totalCustomers.value) : '—'}
          metric={metrics?.totalCustomers}
          icon={Users}
          parts={customerParts}
          {...shared}
        />
        <KpiCard
          label="Avg Order Value"
          value={metrics ? formatCurrency(metrics.avgOrderValue.value) : '—'}
          metric={metrics?.avgOrderValue}
          icon={ShoppingCart}
          {...shared}
        />
        <KpiCard
          label="Total Orders"
          value={metrics ? formatInteger(metrics.totalOrders.value) : '—'}
          metric={metrics?.totalOrders}
          icon={Package}
          {...shared}
        />
      </CardRow>

      {/* The cost rows that stood here — total, product, shipping and
          transaction cost, then gross profit, margin and a second copy of
          total sales — are gone. The statement above the grid carries every
          one of those lines, against the period's total and with its own
          movement, so the cards restated it a second time in a weaker form. */}
    </section>
  )
}
