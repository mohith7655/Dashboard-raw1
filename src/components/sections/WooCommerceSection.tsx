import { DollarSign, Package, ShoppingCart, Users } from 'lucide-react'
import type { ProfitAndLoss, WooMetrics } from '../../lib/types'
import { formatCurrency, formatInteger } from '../../lib/format'
import { deltaPct, round2 } from '../../lib/derive'
import { KpiCard, type KpiPart } from '../KpiCard'
import { CardRow } from '../CardRow'
import { SectionLabel } from '../SectionLabel'

interface WooCommerceSectionProps {
  metrics: WooMetrics | undefined
  loading: boolean
  failed: boolean
  /** Leads the section, above the KPI grid — the statement in full. */
  summary?: React.ReactNode
}

export function WooCommerceSection({
  metrics,
  loading,
  failed,
  summary,
}: WooCommerceSectionProps) {
  const shared = { loading, unavailable: failed }

  // What the headline is made of, in the same card. Gross is sales before
  // coupons come off; net is what survives refunds, which is the figure that
  // actually reached the bank. Each is compared against its own figure in the
  // comparison window, which is null when the comparison is off.
  const was = metrics?.pnlPrevious ?? null
  const netOfRefunds = (p: ProfitAndLoss): number => round2(p.totalRevenue - p.refunds)

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
          label: 'Net of refunds',
          value: formatCurrency(netOfRefunds(metrics.pnl)),
          deltaPct: was ? deltaPct(netOfRefunds(metrics.pnl), netOfRefunds(was)) : null,
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
