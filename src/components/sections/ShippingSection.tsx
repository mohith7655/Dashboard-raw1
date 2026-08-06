import { useMemo } from 'react'
import type {
  CountryShippingCost,
  ShippingChargedPayload,
  WooMetrics,
} from '../../lib/types'
import { shippingEconomics } from '../../lib/pnl'
import {
  countryShipping,
  storeShipping,
  unlistedCharged,
} from '../../lib/shippingPnl'
import { shippingCostLines, totalShippingCost } from '../../lib/shippingCosts'
import { SectionLabel } from '../SectionLabel'
import { ShippingByCountryTable } from '../charts/ShippingByCountryTable'
import { ShippingCostsCard } from './ShippingCostsCard'
import { ShippingPnlCard } from './ShippingPnlCard'
import { ShippingStatsCard } from './ShippingStatsCard'

interface ShippingSectionProps {
  woo: WooMetrics | undefined
  loading: boolean
  failed: boolean
  /** Postage charged per destination; undefined until that query answers. */
  charged: ShippingChargedPayload | undefined
  chargedLoading: boolean
  chargedFailed: boolean
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
  charged,
  chargedLoading,
  chargedFailed,
  extraCosts,
  extraLoading,
  extraError,
  savingExtra,
  onSaveExtra,
}: ShippingSectionProps) {
  const shipping = woo ? shippingEconomics(woo) : null
  const markets = useMemo(() => woo?.revenueByCountry ?? [], [woo])

  const lines = useMemo(
    () => shippingCostLines(extraCosts ?? [], markets),
    [extraCosts, markets],
  )
  const extraTotal = totalShippingCost(lines)

  // Postage in against postage out. The charged side is the statement's own
  // shipping line, so the two views cannot state different figures.
  const result = woo
    ? storeShipping(woo.pnl.shippingCharged, woo.shippingCost.value, extraTotal)
    : null

  const byCountry = useMemo(
    () => countryShipping(markets, charged, extraCosts ?? []),
    [markets, charged, extraCosts],
  )
  const unlisted = unlistedCharged(charged, byCountry)

  return (
    <section className="flex flex-col gap-4">
      <SectionLabel>Shipping Costs</SectionLabel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ShippingStatsCard
          orderCost={woo?.shippingCost.value ?? 0}
          extraCost={extraTotal}
          costMetric={woo?.shippingCost}
          orders={woo?.totalOrders.value ?? 0}
          revenue={woo?.totalRevenue.value ?? 0}
          mix={shipping?.mix ?? []}
          totalCost={woo?.totalCost.value ?? 0}
          loading={loading || extraLoading}
          failed={failed}
        />

        {/* The question the costs alone cannot answer: the store spent this
            much on postage, but was any of it paid for? */}
        <ShippingPnlCard
          result={result}
          orders={woo?.totalOrders.value ?? 0}
          extraCost={extraTotal}
          orderCost={woo?.shippingCost.value ?? 0}
          loading={loading || extraLoading}
          failed={failed}
        />
      </div>

      <ShippingByCountryTable
        rows={byCountry}
        unlisted={unlisted}
        loading={loading || (chargedLoading && byCountry.length === 0)}
        unavailable={
          failed
            ? 'Shipping data unavailable'
            : chargedFailed
              ? 'Postage charged could not be read for this period'
              : undefined
        }
      />

      <ShippingCostsCard
        costs={extraCosts}
        markets={markets}
        loading={extraLoading}
        error={extraError}
        saving={savingExtra}
        onSave={onSaveExtra}
      />
    </section>
  )
}
