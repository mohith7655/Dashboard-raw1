import { useId, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, Megaphone } from 'lucide-react'
import type { AdsMetrics, Polarity } from '../../lib/types'
import type { BlendedAds } from '../../lib/pnl'
import { nonAttributing } from '../../lib/pnl'
import { deltaPct } from '../../lib/derive'
import {
  formatCtr,
  formatCurrency,
  formatDeltaPercent,
  formatInteger,
  formatPercent,
  formatDifference,
  formatPrevious as was,
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
  blended: BlendedAds | null
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

function changeColor(change: number, polarity: Polarity): string {
  if (polarity === 'neutral' || change === 0) return 'text-muted'
  const good = polarity === 'down-good' ? change < 0 : change > 0
  return good ? 'text-pos' : 'text-neg'
}

/** Every ad platform as one account, in the statement's row grammar. */
export function AdsStatsCard({
  metrics,
  platforms,
  blended,
  subtitle,
  loading,
}: AdsStatsCardProps) {
  const rows = metrics ? buildRows(metrics, platforms) : []
  const unattributed = nonAttributing(platforms)

  const prevSpend = metrics?.previousTotals?.spend ?? null

  // Closed to begin with, as the coupon card is. The summary line under the
  // title is the answer most readings want; the figures and the table they
  // break into are what unfolds.
  //
  // The per-figure detail is its own state, so opening one figure does not
  // close the card out from under it.
  const [open, setOpen] = useState(false)
  const bodyId = useId()

  /**
   * The two figures the card leads on: what was spent, and what share of sales
   * that was.
   *
   * Set as the pair the CEO Dashboard leads on, at the same size. The rates and
   * returns that used to stand beside them are gone: spend per day, the
   * platforms' own return and the store's blended one all read on the CEO card
   * already, and a figure stated on two cards is a figure that can come to
   * disagree with itself.
   */
  const figures: FigureSpec[] = []
  if (metrics) {
    figures.push({
      key: 'spend',
      label: 'Spend',
      value: formatCurrency(metrics.spend.value),
      change: metrics.spend.deltaPct,
      previous: prevSpend === null ? undefined : formatCurrency(prevSpend),
      difference:
        prevSpend === null
          ? undefined
          : formatDifference(metrics.spend.value - prevSpend, formatCurrency),
      polarity: 'down-good',
    })
  }

  if (blended) {
    figures.push({
      key: 'spend-share',
      label: 'Spend % of sales',
      value: formatPercent(blended.shareOfRevenue),
      change: blended.previous
        ? deltaPct(blended.shareOfRevenue, blended.previous.shareOfRevenue)
        : null,
      previous: blended.previous
        ? formatPercent(blended.previous.shareOfRevenue)
        : undefined,
      difference: blended.previous
        ? formatDifference(
            blended.shareOfRevenue - blended.previous.shareOfRevenue,
            formatPercent,
          )
        : undefined,
      polarity: 'down-good',
    })
  }

  return (
    <div className="card">
      {/* The whole title row opens the table, as the coupon card's does — the
          chevron sits out on the right beside the icon rather than tucked
          against the label, so the target is the row and not four words of it.

          The figures below are their own controls. Nesting one button inside
          another is invalid, and the two answer different questions anyway:
          what makes up this figure, against the whole table of them. */}
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="group flex min-w-0 flex-1 items-start justify-between gap-3 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="kpi-label block truncate transition-colors group-hover:text-ink">
              All ads
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-muted transition-colors group-hover:text-ink">
            <ChevronDown
              size={15}
              className={`transition-transform ${open ? 'rotate-180' : ''}`}
            />
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-icon-btn">
              <Megaphone size={15} strokeWidth={2} />
            </span>
          </span>
        </button>
      </div>

      {/* Outside the fold: these two are what the card is for, and a reader
          after nothing more than what was spent should not have to open
          anything. The table they break into is what unfolds. */}
      {!loading && figures.length > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {figures.map((figure) => (
            <HeadlineFigure key={figure.key} figure={figure} />
          ))}
        </div>
      )}

      <div id={bodyId} hidden={!open}>
        {subtitle && <p className="mt-3 text-[12px] text-muted">{subtitle}</p>}

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
              ROAS. Blended ROAS above includes their spend, since it measures
              against the store&apos;s own revenue rather than a platform&apos;s
              claim.
            </p>
          )}
        </>
        )}
      </div>
    </div>
  )
}

/** One of the two figures the card leads on. */
interface FigureSpec {
  key: string
  label: string
  value: string
  change: number | null
  /** Pre-formatted figure for the comparison window; omitted when it is off. */
  previous?: string
  /** How far it moved, in its own units. */
  difference?: string
  polarity?: Polarity
}

/**
 * A big box, matching the pair that leads the CEO Dashboard.
 *
 * Not a control any more. It carried a breakdown of the platforms behind it,
 * which is the table directly below on this card — the one place the split was
 * already stated in full.
 */
function HeadlineFigure({ figure }: { figure: FigureSpec }) {
  const { label, value, change, previous, difference, polarity = 'up-good' } = figure

  return (
    <div className="min-w-0 rounded-lg border border-btn-border px-3 py-2.5">
      <div className="truncate text-[10.5px] uppercase tracking-wide text-label">
        {label}
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="truncate text-[24px] font-semibold leading-tight tabular-nums text-ink">
          {value}
        </span>
        {change !== null && (
          <span
            className={`flex items-center gap-0.5 text-[11px] tabular-nums ${changeColor(
              change,
              polarity,
            )}`}
          >
            {change < 0 ? (
              <ArrowDown size={10} strokeWidth={3} />
            ) : (
              <ArrowUp size={10} strokeWidth={3} />
            )}
            {formatDeltaPercent(change)}
          </span>
        )}
      </div>
      {previous !== undefined && (
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-[11px] tabular-nums">
          <span className="text-label">{previous}</span>
          {difference !== undefined && <span className="text-[#5a5a62]">{difference}</span>}
        </div>
      )}
    </div>
  )
}

function buildRows(
  metrics: AdsMetrics,
  platforms: { name: string; metrics: AdsMetrics }[],
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
      previous: reports(metrics, key) ? was(metrics[key], format) : undefined,
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
        // can be up over the window while Google is down. Its own baseline for
        // the same reason.
        change: known ? platform.metrics[key].deltaPct : null,
        previous: known ? was(platform.metrics[key], format) : undefined,
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

  // Blended ROAS and spend as a share of sales are no longer listed here: both
  // are on the title row, where the figures they qualify are.
  return rows
}
