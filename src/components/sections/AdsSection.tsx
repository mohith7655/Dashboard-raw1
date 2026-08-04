import {
  BarChart3,
  Eye,
  Gauge,
  MousePointerClick,
  Percent,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import type { AdsMetrics } from '../../lib/types'
import {
  formatCtr,
  formatCurrency,
  formatInteger,
  formatRoas,
} from '../../lib/format'
import { KpiCard } from '../KpiCard'
import { SectionLabel } from '../SectionLabel'

interface AdsSectionProps {
  title: string
  glyph: React.ReactNode
  metrics: AdsMetrics | undefined
  loading: boolean
  failed: boolean
  /** Sits under the title, for a section whose scope needs saying. */
  subtitle?: string
  /**
   * Cards appended after the eight standard ones. The combined view adds the
   * two figures that only exist once several platforms are added together.
   */
  extra?: React.ReactNode
}

const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'

/** Meta and Google Ads report the same shape, so they share one section. */
export function AdsSection({
  title,
  glyph,
  metrics,
  loading,
  failed,
  subtitle,
  extra,
}: AdsSectionProps) {
  const shared = { loading, unavailable: failed }

  return (
    <section>
      <SectionLabel glyph={glyph}>{title}</SectionLabel>
      {subtitle && <p className="-mt-1 mb-3 text-[12px] text-muted">{subtitle}</p>}

      <div className={GRID}>
        <KpiCard
          label="Spend"
          value={metrics ? formatCurrency(metrics.spend.value) : '—'}
          metric={metrics?.spend}
          polarity="down-good"
          icon={Wallet}
          {...shared}
        />
        <KpiCard
          label="Impressions"
          value={metrics ? formatInteger(metrics.impressions.value) : '—'}
          metric={metrics?.impressions}
          icon={Eye}
          {...shared}
        />
        <KpiCard
          label="Clicks"
          value={metrics ? formatInteger(metrics.clicks.value) : '—'}
          metric={metrics?.clicks}
          icon={MousePointerClick}
          {...shared}
        />
        <KpiCard
          label="CTR"
          value={metrics ? formatCtr(metrics.ctr.value) : '—'}
          metric={metrics?.ctr}
          icon={Percent}
          {...shared}
        />
      </div>

      <div className={`${GRID} mt-4`}>
        <KpiCard
          label="ROAS"
          value={metrics ? formatRoas(metrics.roas.value) : '—'}
          metric={metrics?.roas}
          icon={TrendingUp}
          {...shared}
        />
        <KpiCard
          label="CPC"
          value={metrics ? formatCurrency(metrics.cpc.value) : '—'}
          metric={metrics?.cpc}
          polarity="down-good"
          icon={Gauge}
          {...shared}
        />
        <KpiCard
          label="CPM"
          value={metrics ? formatCurrency(metrics.cpm.value) : '—'}
          metric={metrics?.cpm}
          polarity="down-good"
          icon={BarChart3}
          {...shared}
        />
        <KpiCard
          label="Conversions"
          value={metrics ? formatInteger(metrics.conversions.value) : '—'}
          metric={metrics?.conversions}
          icon={Target}
          {...shared}
        />
      </div>

      {extra && <div className={`${GRID} mt-4`}>{extra}</div>}
    </section>
  )
}
