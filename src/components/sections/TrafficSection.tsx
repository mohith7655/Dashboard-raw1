import { MousePointerClick, Percent, ShoppingCart, Users } from 'lucide-react'
import type { Ga4Dimension, Ga4Report, TrafficMetrics, WooMetrics } from '../../lib/types'
import { formatCurrency, formatInteger, formatPercent } from '../../lib/format'
import { KpiCard } from '../KpiCard'
import { SectionLabel } from '../SectionLabel'
import {
  ConversionRateOverTime,
  VisitorsOverTime,
} from '../charts/TrafficOverTime'
import { RevenueByTrafficSource } from '../charts/RevenueByTrafficSource'
import { Ga4BreakdownCard } from './Ga4BreakdownCard'

interface TrafficSectionProps {
  traffic: TrafficMetrics | undefined
  woo: WooMetrics | undefined
  loading: boolean
  failed: boolean
  wooFailed: boolean
  ga4: Ga4Report | undefined
  ga4Dimension: Ga4Dimension
  onGa4DimensionChange: (dimension: Ga4Dimension) => void
  ga4Loading: boolean
  ga4Fetching: boolean
  ga4Error: string | null
}

const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'

export function TrafficSection({
  traffic,
  woo,
  loading,
  failed,
  wooFailed,
  ga4,
  ga4Dimension,
  onGa4DimensionChange,
  ga4Loading,
  ga4Fetching,
  ga4Error,
}: TrafficSectionProps) {
  // A store with no analytics integration still answers 200, with every figure
  // zero. Treating that as real would put a 0% conversion rate beside a page of
  // live orders, so it is called out as missing instead.
  const connected = !traffic || traffic.available
  const shared = { loading, unavailable: failed || !connected }

  const visitors = traffic?.visitors.value ?? 0
  const revenuePerVisitor =
    woo && visitors > 0 ? woo.totalRevenue.value / visitors : 0

  if (!loading && !failed && traffic && !traffic.available) {
    return (
      <section className="flex flex-col gap-4">
        <SectionLabel>Traffic</SectionLabel>
        <div className="card">
          <h3 className="text-[15px] font-semibold text-ink">
            No analytics provider connected
          </h3>
          <p className="mt-1.5 max-w-prose text-[13px] text-muted">
            Metorik relays visitor counts from Google Analytics rather than
            measuring them itself, and this store has no GA4 property connected —
            so there is no traffic to show, which is not the same as no traffic.
            Connect it under Metorik → Integrations → Google Analytics &amp; Ads,
            then click Retry.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <SectionLabel>Traffic</SectionLabel>

        <div className={GRID}>
          <KpiCard
            label="Visitors"
            value={traffic ? formatInteger(traffic.visitors.value) : '—'}
            metric={traffic?.visitors}
            icon={Users}
            {...shared}
          />
          <KpiCard
            label="Conversion Rate"
            value={traffic ? formatPercent(traffic.conversionRate.value) : '—'}
            metric={traffic?.conversionRate}
            icon={Percent}
            {...shared}
          />
          <KpiCard
            label="Revenue per Visitor"
            value={
              traffic && woo && visitors > 0
                ? formatCurrency(revenuePerVisitor)
                : '—'
            }
            icon={MousePointerClick}
            loading={loading}
            unavailable={failed || wooFailed || !connected}
          />
          <KpiCard
            label="Converting Orders"
            value={traffic ? formatInteger(traffic.orders.value) : '—'}
            metric={traffic?.orders}
            icon={ShoppingCart}
            {...shared}
          />
        </div>

        {traffic?.visitorDefinition && (
          <p className="mt-3 text-[12px] text-muted">
            {traffic.visitorDefinition}
            {traffic.providerMetric && ` (${traffic.providerMetric})`}. Orders here
            are counted on the provider&apos;s own basis, so they can differ
            slightly from the paid-order total on the Overview.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <VisitorsOverTime
          data={traffic?.series ?? []}
          loading={loading}
          unavailable={failed ? 'Visitor data unavailable' : undefined}
        />
        <ConversionRateOverTime
          data={traffic?.series ?? []}
          loading={loading}
          unavailable={failed ? 'Conversion data unavailable' : undefined}
        />
      </div>

      <Ga4BreakdownCard
        report={ga4}
        dimension={ga4Dimension}
        onDimensionChange={onGa4DimensionChange}
        loading={ga4Loading}
        fetching={ga4Fetching}
        error={ga4Error}
      />

      <RevenueByTrafficSource
        data={woo?.revenueBySource ?? []}
        loading={loading}
        unavailable={wooFailed ? 'Traffic source data unavailable' : undefined}
      />
    </section>
  )
}
