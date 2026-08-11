import { useMemo } from 'react'
import { Percent, Receipt } from 'lucide-react'
import type { AdsMetrics, DateRange, OperatingCost, WooMetrics } from '../../lib/types'
import { profitWaterfall } from '../../lib/pnl'
import { costLines, totalOperatingCost } from '../../lib/operatingCosts'
import { formatCurrency, formatPercent, formatPrevious } from '../../lib/format'
import { type StatRowData } from '../StatRows'
import { RowsCard } from '../RowsCard'
import { SectionLabel } from '../SectionLabel'
import { ProfitWaterfall } from '../charts/ProfitWaterfall'
import { BlendedRoasCard } from './BlendedRoasCard'
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

  /**
   * The headline four, as rows.
   *
   * Total sales heads the group and the three under it are indented, so the
   * shape reads before any figure does: what came in, what it cost, what was
   * left, and what share of the first that last is.
   */
  const headline = useMemo((): StatRowData[] => {
    if (!woo) return []
    return [
      {
        label: 'Total sales',
        value: formatCurrency(woo.totalRevenue.value),
        kind: 'total',
        share: null,
        change: woo.totalRevenue.deltaPct,
        previous: formatPrevious(woo.totalRevenue, formatCurrency),
      },
      {
        label: 'Total cost',
        value: formatCurrency(woo.totalCost.value),
        kind: 'part',
        share: woo.totalRevenue.value ? woo.totalCost.value / woo.totalRevenue.value : 0,
        change: woo.totalCost.deltaPct,
        previous: formatPrevious(woo.totalCost, formatCurrency),
        polarity: 'down-good',
      },
      {
        label: 'Gross profit',
        value: formatCurrency(woo.grossProfit.value),
        kind: 'part',
        share: woo.totalRevenue.value ? woo.grossProfit.value / woo.totalRevenue.value : 0,
        change: woo.grossProfit.deltaPct,
        previous: formatPrevious(woo.grossProfit, formatCurrency),
      },
      {
        // No share of its own: it is already the share the row above takes of
        // the row above that, and printing a second one beside it would be the
        // same fact twice in the same units.
        label: 'Gross margin',
        value: formatPercent(woo.grossMargin.value),
        kind: 'part',
        share: null,
        change: woo.grossMargin.deltaPct,
        previous: formatPrevious(woo.grossMargin, formatPercent),
      },
    ]
  }, [woo])

  /** What the overheads and the advertising left, once both come off. */
  const net = useMemo((): StatRowData[] => {
    if (!woo) return []
    return [
      {
        label: 'Operating costs',
        value: formatCurrency(operatingCost),
        kind: 'part',
        share: woo.totalRevenue.value ? operatingCost / woo.totalRevenue.value : 0,
        change: null,
        polarity: 'down-good',
      },
      {
        label: `Net profit ${netLabel}`,
        value: formatCurrency(netProfit),
        kind: 'total',
        share: null,
        change: null,
      },
      {
        label: 'Net margin',
        value: formatPercent(netMargin),
        kind: 'part',
        share: null,
        change: null,
      },
    ]
  }, [woo, operatingCost, netProfit, netMargin, netLabel])

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-4">
        <SectionLabel>Profit &amp; Loss</SectionLabel>

        {/* The same four figures the KPI tiles held, in the row grammar the
            CEO Dashboard uses. Nothing is added or dropped — set as rows they
            carry figure, change and baseline in aligned columns, and the eye
            reads down one column instead of across four cards. */}
        <RowsCard
          title="Profit &amp; Loss"
          icon={Percent}
          rows={headline}
          loading={loading}
          unavailable={failed ? 'Profit data unavailable for this period.' : null}
        />
      </div>

      <ProfitWaterfall
        steps={steps}
        loading={loading}
        unavailable={failed ? 'Profit data unavailable' : undefined}
      />

      {showNet && (
        <RowsCard
          title="After ads and overheads"
          icon={Receipt}
          rows={net}
          loading={loading || costsLoading}
          unavailable={costsError ? 'Operating costs unavailable.' : null}
        />
      )}

      {/* Directly under the profit lines the ad spend was struck from: the
          waterfall says what advertising cost, and this says what came back. */}
      <BlendedRoasCard
        woo={woo}
        reportedAds={reportedAds}
        loading={loading}
        wooFailed={failed}
      />

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
