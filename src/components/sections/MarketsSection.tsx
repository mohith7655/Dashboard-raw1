import { Coins, Globe, MapPin, Plane } from 'lucide-react'
import type { WooMetrics } from '../../lib/types'
import { marketSummary } from '../../lib/pnl'
import { formatInteger, formatPercent } from '../../lib/format'
import { KpiCard } from '../KpiCard'
import { SectionLabel } from '../SectionLabel'
import { MarketTable } from '../charts/MarketTable'

interface MarketsSectionProps {
  woo: WooMetrics | undefined
  loading: boolean
  failed: boolean
}

const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'

export function MarketsSection({ woo, loading, failed }: MarketsSectionProps) {
  const shared = { loading, unavailable: failed }
  const summary = woo ? marketSummary(woo) : null
  const currency = woo?.storeCurrency ?? 'store currency'

  return (
    <section className="flex flex-col gap-4">
      <div>
        <SectionLabel>Markets</SectionLabel>

        <div className={GRID}>
          <KpiCard
            label="Countries Selling"
            value={summary ? formatInteger(summary.countries) : '—'}
            icon={Globe}
            {...shared}
          />
          <KpiCard
            label="Top Country"
            value={summary?.topCountry ? summary.topCountry.key : '—'}
            icon={MapPin}
            {...shared}
          />
          <KpiCard
            label="Top Country Share"
            value={summary?.topCountry ? formatPercent(summary.topCountry.share) : '—'}
            icon={Plane}
            {...shared}
          />
          <KpiCard
            label="Currencies Billed"
            value={summary ? formatInteger(summary.currencies) : '—'}
            icon={Coins}
            {...shared}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <MarketTable
          title="Revenue by Country"
          subtitle="Billing country on each paid order"
          keyHeader="Country"
          rows={woo?.revenueByCountry ?? []}
          measure="revenue"
          loading={loading}
          unavailable={failed ? 'Country data unavailable' : undefined}
        />
        <MarketTable
          title="Revenue by Currency"
          subtitle={`What buyers paid in, converted to ${currency}`}
          keyHeader="Currency"
          rows={woo?.revenueByCurrency ?? []}
          measure="revenue"
          loading={loading}
          unavailable={failed ? 'Currency data unavailable' : undefined}
        />
      </div>

      {summary && !loading && !failed && (
        <p className="text-[12px] text-muted">
          {formatPercent(summary.foreignShare)} of revenue was billed in a currency
          other than {currency}. Every figure on this page is converted to{' '}
          {currency}, so the two splits both sum back to total revenue.
        </p>
      )}
    </section>
  )
}
