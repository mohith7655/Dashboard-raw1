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
import { KpiCard, type KpiPart } from '../KpiCard'
import { CardRow } from '../CardRow'
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
   * The platforms rolled into `metrics`. Given them, every card splits its
   * headline by platform inside the card. Omitted on a section that already
   * shows one platform, where the split would just restate the figure.
   */
  platforms?: { name: string; metrics: AdsMetrics }[]
  /**
   * Cards appended after the eight standard ones. The combined view adds the
   * two figures that only exist once several platforms are added together.
   */
  extra?: React.ReactNode
}

type AdsMetricKey =
  | 'spend'
  | 'impressions'
  | 'clicks'
  | 'ctr'
  | 'roas'
  | 'cpc'
  | 'cpm'
  | 'conversions'

/**
 * Which figures are sums of the platforms, and which are ratios of those sums.
 *
 * Only a sum can be apportioned. Meta's 1.3% CTR and Google's 1.55% do not
 * make up the combined 4.45% in any share sense, and printing `50%` beside one
 * of them would invite exactly that reading — so the ratio cards show each
 * platform's own figure with no percentage at all.
 */
const ADDITIVE: ReadonlySet<AdsMetricKey> = new Set<AdsMetricKey>([
  'spend',
  'impressions',
  'clicks',
  'conversions',
])

/** Meta and Google Ads report the same shape, so they share one section. */
export function AdsSection({
  title,
  glyph,
  metrics,
  loading,
  failed,
  subtitle,
  platforms,
  extra,
}: AdsSectionProps) {
  const shared = { loading, unavailable: failed }

  const partsFor = (
    key: AdsMetricKey,
    format: (n: number) => string,
  ): KpiPart[] | undefined => {
    if (!platforms || platforms.length === 0) return undefined
    const total = metrics?.[key].value ?? 0
    return platforms.map((platform) => ({
      label: platform.name,
      value: format(platform.metrics[key].value),
      share: ADDITIVE.has(key)
        ? total
          ? platform.metrics[key].value / total
          : 0
        : undefined,
      // Each platform's own change, not a share of the combined one — Meta can
      // be up over the window while Google is down.
      deltaPct: platform.metrics[key].deltaPct,
    }))
  }

  return (
    <section>
      <SectionLabel glyph={glyph}>{title}</SectionLabel>
      {subtitle && <p className="-mt-1 mb-3 text-[12px] text-muted">{subtitle}</p>}

      <CardRow>
        <KpiCard
          label="Spend"
          value={metrics ? formatCurrency(metrics.spend.value) : '—'}
          metric={metrics?.spend}
          polarity="down-good"
          icon={Wallet}
          parts={partsFor('spend', formatCurrency)}
          {...shared}
        />
        <KpiCard
          label="Impressions"
          value={metrics ? formatInteger(metrics.impressions.value) : '—'}
          metric={metrics?.impressions}
          icon={Eye}
          parts={partsFor('impressions', formatInteger)}
          {...shared}
        />
        <KpiCard
          label="Clicks"
          value={metrics ? formatInteger(metrics.clicks.value) : '—'}
          metric={metrics?.clicks}
          icon={MousePointerClick}
          parts={partsFor('clicks', formatInteger)}
          {...shared}
        />
        <KpiCard
          label="CTR"
          value={metrics ? formatCtr(metrics.ctr.value) : '—'}
          metric={metrics?.ctr}
          icon={Percent}
          parts={partsFor('ctr', formatCtr)}
          {...shared}
        />
      </CardRow>

      <CardRow className="mt-4">
        <KpiCard
          label="ROAS"
          value={metrics ? formatRoas(metrics.roas.value) : '—'}
          metric={metrics?.roas}
          icon={TrendingUp}
          parts={partsFor('roas', formatRoas)}
          {...shared}
        />
        <KpiCard
          label="CPC"
          value={metrics ? formatCurrency(metrics.cpc.value) : '—'}
          metric={metrics?.cpc}
          polarity="down-good"
          icon={Gauge}
          parts={partsFor('cpc', formatCurrency)}
          {...shared}
        />
        <KpiCard
          label="CPM"
          value={metrics ? formatCurrency(metrics.cpm.value) : '—'}
          metric={metrics?.cpm}
          polarity="down-good"
          icon={BarChart3}
          parts={partsFor('cpm', formatCurrency)}
          {...shared}
        />
        <KpiCard
          label="Conversions"
          value={metrics ? formatInteger(metrics.conversions.value) : '—'}
          metric={metrics?.conversions}
          icon={Target}
          parts={partsFor('conversions', formatInteger)}
          {...shared}
        />
      </CardRow>

      {extra && <CardRow className="mt-4">{extra}</CardRow>}
    </section>
  )
}
