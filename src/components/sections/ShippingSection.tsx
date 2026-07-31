import { Coins, Percent, ShoppingCart, Truck } from 'lucide-react'
import type { WooMetrics } from '../../lib/types'
import { shippingEconomics } from '../../lib/pnl'
import { formatCurrency, formatPercent } from '../../lib/format'
import { KpiCard } from '../KpiCard'
import { SectionLabel } from '../SectionLabel'
import { CostMix } from '../charts/CostMix'
import { MarketTable } from '../charts/MarketTable'

interface ShippingSectionProps {
  woo: WooMetrics | undefined
  loading: boolean
  failed: boolean
}

const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'

export function ShippingSection({ woo, loading, failed }: ShippingSectionProps) {
  const shared = { loading, unavailable: failed }
  const shipping = woo ? shippingEconomics(woo) : null

  return (
    <section className="flex flex-col gap-4">
      <div>
        <SectionLabel>Shipping Costs</SectionLabel>

        <div className={GRID}>
          <KpiCard
            label="Shipping Cost"
            value={shipping ? formatCurrency(shipping.cost) : '—'}
            metric={woo?.shippingCost}
            polarity="down-good"
            icon={Truck}
            {...shared}
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
          <KpiCard
            label="Share of Total Cost"
            value={shipping ? formatPercent(shipping.shareOfCost) : '—'}
            polarity="down-good"
            icon={Coins}
            {...shared}
          />
        </div>
      </div>

      <CostMix
        slices={shipping?.mix ?? []}
        total={woo?.totalCost.value ?? 0}
        loading={loading}
        unavailable={failed ? 'Cost data unavailable' : undefined}
      />

      <MarketTable
        title="Shipping cost by country"
        subtitle="Every destination, dearest to fulfil first"
        keyHeader="Country"
        rows={woo?.revenueByCountry ?? []}
        measure="shippingCost"
        loading={loading}
        unavailable={failed ? 'Shipping data unavailable' : undefined}
      />
    </section>
  )
}
