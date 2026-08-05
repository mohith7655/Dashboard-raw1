import { useMemo } from 'react'
import { Coins, Percent, ShoppingCart, Truck } from 'lucide-react'
import type { CountryShippingCost, WooMetrics } from '../../lib/types'
import { shippingEconomics } from '../../lib/pnl'
import {
  shippingCostLines,
  totalShippingCost,
  withShippingCosts,
} from '../../lib/shippingCosts'
import { formatCurrency, formatPercent } from '../../lib/format'
import { KpiCard } from '../KpiCard'
import { CardRow } from '../CardRow'
import { SectionLabel } from '../SectionLabel'
import { CostMix } from '../charts/CostMix'
import { MarketTable } from '../charts/MarketTable'
import { ShippingCostsCard } from './ShippingCostsCard'

interface ShippingSectionProps {
  woo: WooMetrics | undefined
  loading: boolean
  failed: boolean
  /** Hand-entered surcharges; undefined until the stored list loads. */
  extraCosts: CountryShippingCost[] | undefined
  extraLoading: boolean
  /** A failed save matters more than a stale load — either blocks trusting the list. */
  extraError: string | null
  savingExtra: boolean
  onSaveExtra: (costs: CountryShippingCost[]) => void
}

export function ShippingSection({
  woo,
  loading,
  failed,
  extraCosts,
  extraLoading,
  extraError,
  savingExtra,
  onSaveExtra,
}: ShippingSectionProps) {
  const shared = { loading, unavailable: failed }
  const shipping = woo ? shippingEconomics(woo) : null
  const markets = useMemo(() => woo?.revenueByCountry ?? [], [woo])

  const lines = useMemo(
    () => shippingCostLines(extraCosts ?? [], markets),
    [extraCosts, markets],
  )
  const extraTotal = totalShippingCost(lines)

  // The country split with the surcharges folded in, so a destination that is
  // cheap to post to but expensive to clear customs on reads as what it
  // actually costs.
  const withExtras = useMemo(() => withShippingCosts(markets, lines), [markets, lines])

  return (
    <section className="flex flex-col gap-4">
      <div>
        <SectionLabel>Shipping Costs</SectionLabel>

        <CardRow>
          <KpiCard
            label="Shipping Cost"
            value={shipping ? formatCurrency(shipping.cost) : '—'}
            metric={woo?.shippingCost}
            polarity="down-good"
            icon={Truck}
            {...shared}
          />
          <KpiCard
            label="Extra Shipping Cost"
            value={formatCurrency(extraTotal)}
            polarity="down-good"
            icon={Coins}
            loading={extraLoading}
          />
          <KpiCard
            label="Shipping per Order"
            value={shipping ? formatCurrency(shipping.perOrder) : '—'}
            polarity="down-good"
            icon={ShoppingCart}
            {...shared}
          />
          <KpiCard
            label="Share of Revenue"
            value={shipping ? formatPercent(shipping.shareOfRevenue) : '—'}
            polarity="down-good"
            icon={Percent}
            {...shared}
          />
        </CardRow>
      </div>

      <CostMix
        slices={shipping?.mix ?? []}
        total={woo?.totalCost.value ?? 0}
        loading={loading}
        unavailable={failed ? 'Cost data unavailable' : undefined}
      />

      <ShippingCostsCard
        costs={extraCosts}
        markets={markets}
        loading={extraLoading}
        error={extraError}
        saving={savingExtra}
        onSave={onSaveExtra}
      />

      <MarketTable
        title="Shipping cost by country"
        subtitle={
          extraTotal > 0
            ? 'Every destination, dearest to fulfil first — including the extra costs above'
            : 'Every destination, dearest to fulfil first'
        }
        keyHeader="Country"
        rows={withExtras}
        measure="shippingCost"
        loading={loading}
        unavailable={failed ? 'Shipping data unavailable' : undefined}
      />
    </section>
  )
}
