import { Megaphone } from 'lucide-react'
import type { AdsMetrics, Polarity } from '../../lib/types'
import { nonAttributing } from '../../lib/pnl'
import {
  formatCtr,
  formatCurrency,
  formatInteger,
  formatPercent,
  formatRoas,
} from '../../lib/format'
import { StatRows, type StatRowData } from '../StatRows'
import { Skeleton } from '../Skeleton'

interface AdsStatsCardProps {
  /** Every reporting platform added together, or undefined if none did. */
  metrics: AdsMetrics | undefined
  /** The platforms behind that total, each splitting the row above it. */
  platforms: { name: string; metrics: AdsMetrics }[]
  /** The two figures that only mean anything once spend meets store revenue. */
  blended: { blendedRoas: number; shareOfRevenue: number } | null
  /** Named rather than implied when only one platform reported. */
  subtitle: string
  loading: boolean
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
 * Only a sum can be apportioned. Meta's 5.8% CTR and Google's 1.56% do not make
 * up the combined figure in any share sense, and printing `50%` beside one of
 * them would invite exactly that reading — so the ratio rows carry each
 * platform's own figure with no share at all.
 */
const ADDITIVE: ReadonlySet<AdsMetricKey> = new Set<AdsMetricKey>([
  'spend',
  'impressions',
  'clicks',
  'conversions',
])

/** Spend and the cost-per figures read better falling; the rest rising. */
const POLARITY: Partial<Record<AdsMetricKey, Polarity>> = {
  spend: 'down-good',
  cpc: 'down-good',
  cpm: 'down-good',
}

/** Every ad platform as one account, in the statement's row grammar. */
export function AdsStatsCard({
  metrics,
  platforms,
  blended,
  subtitle,
  loading,
}: AdsStatsCardProps) {
  const rows = metrics ? buildRows(metrics, platforms, blended) : []
  const unattributed = nonAttributing(platforms)

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="kpi-label truncate">All ads</div>
          {subtitle && <p className="mt-1 text-[12px] text-muted">{subtitle}</p>}
        </div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-icon-btn text-muted">
          <Megaphone size={15} strokeWidth={2} />
        </span>
      </div>

      {loading ? (
        <div className="mt-3 flex flex-col gap-2 border-t border-row-line pt-3">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-3 border-t border-row-line pt-3 text-[12px] text-muted">
          No ad platform reported for this period.
        </p>
      ) : (
        <>
          <StatRows rows={rows} />
          {/* The ROAS above is struck from a narrower base than the spend
              above it. Saying so is the whole point — a return quietly
              measured against a different denominator is worse than none. */}
          {unattributed.length > 0 && (
            <p className="mt-3 text-[12px] leading-relaxed text-muted">
              {unattributed.join(' and ')} report no attributed conversions, so
              they are counted in spend, impressions and clicks but left out of
              ROAS. Blended ROAS below includes their spend, since it measures
              against the store&apos;s own revenue rather than a platform&apos;s
              claim.
            </p>
          )}
        </>
      )}
    </div>
  )
}

function buildRows(
  metrics: AdsMetrics,
  platforms: { name: string; metrics: AdsMetrics }[],
  blended: { blendedRoas: number; shareOfRevenue: number } | null,
): StatRowData[] {
  const rows: StatRowData[] = []

  // Figures a platform has no field for at all. Printed as an em dash rather
  // than as zero: a platform that reports no attribution has not sold nothing.
  const ATTRIBUTED: ReadonlySet<AdsMetricKey> = new Set<AdsMetricKey>([
    'roas',
    'conversions',
  ])
  const reports = (m: AdsMetrics, key: AdsMetricKey) =>
    !ATTRIBUTED.has(key) || m.reportsConversions !== false

  const group = (
    label: string,
    key: AdsMetricKey,
    format: (n: number) => string,
  ) => {
    const polarity = POLARITY[key] ?? 'up-good'
    const total = metrics[key].value

    rows.push({
      label,
      value: reports(metrics, key) ? format(total) : '—',
      kind: 'total',
      share: null,
      change: reports(metrics, key) ? metrics[key].deltaPct : null,
      polarity,
    })

    // Only worth splitting when there is more than one platform behind it;
    // with one, the part would simply restate the row above.
    if (platforms.length < 2) return

    for (const platform of platforms) {
      const known = reports(platform.metrics, key)
      rows.push({
        label: platform.name,
        value: known ? format(platform.metrics[key].value) : 'not reported',
        kind: 'part',
        share:
          known && ADDITIVE.has(key)
            ? total
              ? platform.metrics[key].value / total
              : 0
            : null,
        // Each platform's own change, not a share of the combined one — Meta
        // can be up over the window while Google is down.
        change: known ? platform.metrics[key].deltaPct : null,
        polarity,
      })
    }
  }

  group('Spend', 'spend', formatCurrency)
  group('Impressions', 'impressions', formatInteger)
  group('Clicks', 'clicks', formatInteger)
  group('CTR', 'ctr', formatCtr)
  group('ROAS', 'roas', formatRoas)
  group('CPC', 'cpc', formatCurrency)
  group('CPM', 'cpm', formatCurrency)
  group('Conversions', 'conversions', formatInteger)

  // Absent rather than zero when the store's own figures have not loaded:
  // neither means anything without revenue to set the spend against.
  if (blended) {
    rows.push({
      label: 'Blended ROAS',
      value: formatRoas(blended.blendedRoas),
      kind: 'total',
      share: null,
      change: null,
    })
    rows.push({
      label: 'Spend % of sales',
      value: formatPercent(blended.shareOfRevenue),
      kind: 'total',
      share: null,
      change: null,
      polarity: 'down-good',
    })
  }

  return rows
}
