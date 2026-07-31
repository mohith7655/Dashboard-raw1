import { Coins, DollarSign, Percent, TrendingUp } from 'lucide-react'
import type { AdsMetrics, WooMetrics } from '../../lib/types'
import { profitWaterfall } from '../../lib/pnl'
import { formatCurrency, formatPercent } from '../../lib/format'
import { KpiCard } from '../KpiCard'
import { SectionLabel } from '../SectionLabel'
import { ProfitWaterfall } from '../charts/ProfitWaterfall'

interface ProfitLossSectionProps {
  woo: WooMetrics | undefined
  /** Platforms that actually reported; a failed one is left out, not zeroed. */
  reportedAds: { name: string; metrics: AdsMetrics }[]
  loading: boolean
  failed: boolean
}

const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'

export function ProfitLossSection({
  woo,
  reportedAds,
  loading,
  failed,
}: ProfitLossSectionProps) {
  const shared = { loading, unavailable: failed }
  const adSpend = reportedAds.length
    ? reportedAds.reduce((sum, p) => sum + p.metrics.spend.value, 0)
    : null
  const steps = woo ? profitWaterfall(woo, adSpend) : []
  const netProfit = steps.length ? steps[steps.length - 1].running : 0
  const netMargin =
    woo && woo.totalRevenue.value > 0 ? netProfit / woo.totalRevenue.value : 0

  return (
    <section className="flex flex-col gap-4">
      <div>
        <SectionLabel>Profit &amp; Loss</SectionLabel>

        <div className={GRID}>
          <KpiCard
            label="Total Revenue"
            value={woo ? formatCurrency(woo.totalRevenue.value) : '—'}
            metric={woo?.totalRevenue}
            icon={DollarSign}
            {...shared}
          />
          <KpiCard
            label="Total Cost"
            value={woo ? formatCurrency(woo.totalCost.value) : '—'}
            metric={woo?.totalCost}
            polarity="down-good"
            icon={Coins}
            {...shared}
          />
          <KpiCard
            label="Gross Profit"
            value={woo ? formatCurrency(woo.grossProfit.value) : '—'}
            metric={woo?.grossProfit}
            icon={TrendingUp}
            {...shared}
          />
          <KpiCard
            label="Gross Margin"
            value={woo ? formatPercent(woo.grossMargin.value) : '—'}
            metric={woo?.grossMargin}
            icon={Percent}
            {...shared}
          />
        </div>
      </div>

      <ProfitWaterfall
        steps={steps}
        loading={loading}
        unavailable={failed ? 'Profit data unavailable' : undefined}
      />

      {adSpend !== null && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <KpiCard
            label="Net Profit after Ads"
            value={woo ? formatCurrency(netProfit) : '—'}
            icon={TrendingUp}
            {...shared}
          />
          <KpiCard
            label="Net Margin after Ads"
            value={woo ? formatPercent(netMargin) : '—'}
            icon={Percent}
            {...shared}
          />
        </div>
      )}
    </section>
  )
}
