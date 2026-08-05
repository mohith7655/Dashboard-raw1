import { useMemo } from 'react'
import { Coins, DollarSign, Percent, Receipt, TrendingUp } from 'lucide-react'
import type { AdsMetrics, DateRange, OperatingCost, WooMetrics } from '../../lib/types'
import { profitWaterfall } from '../../lib/pnl'
import { costLines, totalOperatingCost } from '../../lib/operatingCosts'
import { formatCurrency, formatPercent } from '../../lib/format'
import { KpiCard } from '../KpiCard'
import { CardRow } from '../CardRow'
import { SectionLabel } from '../SectionLabel'
import { ProfitWaterfall } from '../charts/ProfitWaterfall'
import { OperatingCostsCard } from './OperatingCostsCard'

interface ProfitLossSectionProps {
  woo: WooMetrics | undefined
  /** Platforms that actually reported; a failed one is left out, not zeroed. */
  reportedAds: { name: string; metrics: AdsMetrics }[]
  loading: boolean
  failed: boolean
  range: DateRange
  costs: OperatingCost[] | undefined
  costsLoading: boolean
  costsError: string | null
  savingCosts: boolean
  onSaveCosts: (costs: OperatingCost[]) => void
}

export function ProfitLossSection({
  woo,
  reportedAds,
  loading,
  failed,
  range,
  costs,
  costsLoading,
  costsError,
  savingCosts,
  onSaveCosts,
}: ProfitLossSectionProps) {
  const shared = { loading, unavailable: failed }
  const adSpend = reportedAds.length
    ? reportedAds.reduce((sum, p) => sum + p.metrics.spend.value, 0)
    : null

  const operatingCost = useMemo(
    () => totalOperatingCost(costLines(costs ?? [], range)),
    [costs, range],
  )

  const steps = woo ? profitWaterfall(woo, adSpend, operatingCost) : []
  const netProfit = steps.length ? steps[steps.length - 1].running : 0
  const netMargin =
    woo && woo.totalRevenue.value > 0 ? netProfit / woo.totalRevenue.value : 0

  // The bottom row restates profit after everything, so it has to say what
  // "everything" covered — ads only, overheads only, or both.
  const netLabel =
    adSpend !== null && operatingCost > 0
      ? 'after Ads & Costs'
      : adSpend !== null
        ? 'after Ads'
        : 'after Costs'
  const showNet = adSpend !== null || operatingCost > 0

  return (
    <section className="flex flex-col gap-4">
      <div>
        <SectionLabel>Profit &amp; Loss</SectionLabel>

        <CardRow>
          <KpiCard
            label="Total Sales"
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
        </CardRow>
      </div>

      <ProfitWaterfall
        steps={steps}
        loading={loading}
        unavailable={failed ? 'Profit data unavailable' : undefined}
      />

      {showNet && (
        <CardRow cols="sm:grid-cols-3">
          <KpiCard
            label="Operating Costs"
            value={formatCurrency(operatingCost)}
            polarity="down-good"
            icon={Receipt}
            loading={costsLoading}
            unavailable={!!costsError}
          />
          <KpiCard
            label={`Net Profit ${netLabel}`}
            value={woo ? formatCurrency(netProfit) : '—'}
            icon={TrendingUp}
            {...shared}
          />
          <KpiCard
            label={`Net Margin ${netLabel}`}
            value={woo ? formatPercent(netMargin) : '—'}
            icon={Percent}
            {...shared}
          />
        </CardRow>
      )}

      <OperatingCostsCard
        costs={costs}
        range={range}
        loading={costsLoading}
        error={costsError}
        saving={savingCosts}
        onSave={onSaveCosts}
      />
    </section>
  )
}
