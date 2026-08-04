import {
  CreditCard,
  DollarSign,
  Package,
  Percent,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react'
import type { WooMetrics } from '../../lib/types'
import { formatCurrency, formatInteger, formatPercent } from '../../lib/format'
import { round2 } from '../../lib/derive'
import { KpiCard, type KpiPart } from '../KpiCard'
import { SectionLabel } from '../SectionLabel'

interface WooCommerceSectionProps {
  metrics: WooMetrics | undefined
  loading: boolean
  failed: boolean
  /** Leads the section, above the KPI grid — the statement in full. */
  summary?: React.ReactNode
}

const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'

export function WooCommerceSection({
  metrics,
  loading,
  failed,
  summary,
}: WooCommerceSectionProps) {
  const shared = { loading, unavailable: failed }

  // What the headline is made of, in the same card. Gross is sales before
  // coupons come off; net is what survives refunds, which is the figure that
  // actually reached the bank.
  const revenueParts: KpiPart[] = metrics
    ? [
        { label: 'Gross sales', value: formatCurrency(metrics.pnl.grossSales) },
        {
          label: 'Net of refunds',
          value: formatCurrency(
            round2(metrics.pnl.totalRevenue - metrics.pnl.refunds),
          ),
        },
      ]
    : []

  // These two do add up to the headline, so each carries its share of it.
  const buyers = metrics?.totalCustomers.value ?? 0
  const customerParts: KpiPart[] = metrics
    ? [
        {
          label: 'New',
          value: formatInteger(metrics.newCustomers.value),
          share: buyers ? metrics.newCustomers.value / buyers : 0,
        },
        {
          label: 'Returning',
          value: formatInteger(metrics.returningCustomers.value),
          share: buyers ? metrics.returningCustomers.value / buyers : 0,
        },
      ]
    : []

  return (
    <section>
      <SectionLabel>WooCommerce</SectionLabel>

      {summary && <div className="mb-4">{summary}</div>}

      <div className={GRID}>
        <KpiCard
          label="Total Revenue"
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
      </div>

      {/* Costs: a rise is bad, so the delta inverts. */}
      <div className={`${GRID} mt-4`}>
        <KpiCard
          label="Total Cost"
          value={metrics ? formatCurrency(metrics.totalCost.value) : '—'}
          metric={metrics?.totalCost}
          polarity="down-good"
          icon={TrendingDown}
          {...shared}
        />
        <KpiCard
          label="Product Cost"
          value={metrics ? formatCurrency(metrics.productCost.value) : '—'}
          metric={metrics?.productCost}
          polarity="down-good"
          icon={Package}
          {...shared}
        />
        <KpiCard
          label="Shipping Cost"
          value={metrics ? formatCurrency(metrics.shippingCost.value) : '—'}
          metric={metrics?.shippingCost}
          polarity="down-good"
          icon={ShoppingCart}
          {...shared}
        />
        <KpiCard
          label="Transaction Cost"
          value={metrics ? formatCurrency(metrics.transactionCost.value) : '—'}
          metric={metrics?.transactionCost}
          polarity="down-good"
          icon={CreditCard}
          {...shared}
        />
      </div>

      {/* Three columns with a wider middle, per the reference layout. */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_2fr_1fr]">
        <KpiCard
          label="Gross Profit"
          value={metrics ? formatCurrency(metrics.grossProfit.value) : '—'}
          metric={metrics?.grossProfit}
          icon={TrendingUp}
          {...shared}
        />
        <KpiCard
          label="Gross Margin"
          value={metrics ? formatPercent(metrics.grossMargin.value) : '—'}
          metric={metrics?.grossMargin}
          icon={Percent}
          {...shared}
        />
        <KpiCard
          label="Total Revenue"
          value={metrics ? formatCurrency(metrics.totalRevenue.value) : '—'}
          metric={metrics?.totalRevenue}
          icon={DollarSign}
          parts={revenueParts}
          {...shared}
        />
      </div>
    </section>
  )
}
