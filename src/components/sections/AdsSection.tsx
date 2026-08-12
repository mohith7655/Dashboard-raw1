import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { AdsMetrics, Polarity } from '../../lib/types'
import {
  formatCtr,
  formatCurrency,
  formatInteger,
  formatRoas,
} from '../../lib/format'
import { StatRows, type StatRowData } from '../StatRows'
import { Skeleton } from '../Skeleton'
import { formatPrevious } from '../../lib/format'
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
  /**
   * Folds the section behind its own heading, closed until asked for. Eight
   * cards per platform is a screenful each before the rest of the dashboard
   * gets a look in, and the combined view above already carries the totals.
   */
  collapsible?: boolean
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
  collapsible = false,
}: AdsSectionProps) {
  const [open, setOpen] = useState(false)
  const bodyId = `ads-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

  /**
   * Every figure the section reports, as rows: each heading with the platforms
   * that make it up indented beneath.
   *
   * Eight tiles in two grids put each figure in its own box, which made spend
   * and the return it bought two unrelated cards a row apart. Set as rows they
   * share columns and read down.
   */
  const rows: StatRowData[] = []
  if (metrics) {
    const group = (
      key: AdsMetricKey,
      label: string,
      format: (n: number) => string,
      polarity: Polarity = 'up-good',
    ) => {
      const total = metrics[key].value
      rows.push({
        label,
        value: format(total),
        kind: 'total',
        share: null,
        change: metrics[key].deltaPct,
        previous: formatPrevious(metrics[key], format),
        polarity,
      })

      // Only worth splitting when more than one platform stands behind it;
      // with one, the part simply restates the row above.
      if (!platforms || platforms.length < 2) return
      for (const platform of platforms) {
        rows.push({
          label: platform.name,
          value: format(platform.metrics[key].value),
          kind: 'part',
          // Only a sum can be apportioned. Meta's CTR and Google's do not make
          // up the combined figure in any share sense.
          share: ADDITIVE.has(key)
            ? total
              ? platform.metrics[key].value / total
              : 0
            : null,
          // Each platform's own change, not a share of the combined one — Meta
          // can be up over the window while Google is down.
          change: platform.metrics[key].deltaPct,
          previous: formatPrevious(platform.metrics[key], format),
          polarity,
        })
      }
    }

    group('roas', 'ROAS', formatRoas)
    group('spend', 'Spend', formatCurrency, 'down-good')
    group('impressions', 'Impressions', formatInteger)
    group('clicks', 'Clicks', formatInteger)
    group('ctr', 'CTR', formatCtr)
    group('cpc', 'CPC', formatCurrency, 'down-good')
    group('cpm', 'CPM', formatCurrency, 'down-good')
    group('conversions', 'Conversions', formatInteger)
  }

  const body = (
    <>
      {subtitle && <p className="-mt-1 mb-3 text-[12px] text-muted">{subtitle}</p>}

      {loading ? (
        <div className="flex flex-col gap-2 border-t border-row-line pt-3">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-full" />
        </div>
      ) : failed || rows.length === 0 ? (
        <p className="border-t border-row-line pt-3 text-[12px] text-muted">
          This platform did not report for this period.
        </p>
      ) : (
        <StatRows rows={rows} />
      )}

      {extra && <div className="mt-4">{extra}</div>}
    </>
  )

  if (!collapsible) {
    return (
      <section>
        <SectionLabel glyph={glyph}>{title}</SectionLabel>
        {body}
      </section>
    )
  }

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="mb-3 flex w-full items-center gap-2 text-left"
      >
        {glyph}
        {/* The section heading's own styling, on a span rather than a heading
            element: a button may only contain phrasing content. */}
        <span className="section-label">{title}</span>
        {/* Closed, the row would otherwise say only that a platform exists.
            What it spent is the one figure worth carrying up here. */}
        {!open && metrics && (
          <span className="text-[12px] tabular-nums text-muted">
            {formatCurrency(metrics.spend.value)} spend
          </span>
        )}
        <ChevronDown
          size={14}
          className={`ml-auto shrink-0 text-muted transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      <div id={bodyId} hidden={!open}>
        {open && body}
      </div>
    </section>
  )
}
