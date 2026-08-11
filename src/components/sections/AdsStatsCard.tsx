import { useId, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, Megaphone } from 'lucide-react'
import type { AdsMetrics, DateRange, Polarity } from '../../lib/types'
import type { BlendedAds } from '../../lib/pnl'
import { nonAttributing } from '../../lib/pnl'
import { daysInRange } from '../../lib/dateRange'
import { deltaPct } from '../../lib/derive'
import {
  formatCtr,
  formatCurrency,
  formatDeltaPercent,
  formatInteger,
  formatPercent,
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
  /** The selected period, for the spend measured per day of it. */
  range: DateRange
  /** The window every headline figure is compared against, or null when off. */
  against: DateRange | null
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
  range,
  against,
  loading,
}: AdsStatsCardProps) {
  const rows = metrics ? buildRows(metrics, platforms) : []
  const unattributed = nonAttributing(platforms)

  // Each window divided by its own length, so a comparison of unequal spans
  // reports a change in the daily rate rather than a change in the days.
  const days = daysInRange(range)
  const daysBefore = against ? daysInRange(against) : null
  const prevSpend = metrics?.previousTotals?.spend ?? null
  const spendPerDay = metrics ? metrics.spend.value / days : 0
  const prevSpendPerDay =
    prevSpend === null || daysBefore === null ? null : prevSpend / daysBefore

  // ROAS is not among the stored counters, being a ratio of two of them; the
  // baseline is struck from the same division the current figure is.
  const prevRoas =
    metrics?.previousTotals && metrics.previousTotals.spend > 0
      ? metrics.previousTotals.conversionValue / metrics.previousTotals.spend
      : null
  const attributed = metrics?.reportsConversions !== false

  // Closed to begin with, as the coupon card is. The summary line under the
  // title is the answer most readings want; the figures and the table they
  // break into are what unfolds.
  //
  // The per-figure detail is its own state, so opening one figure does not
  // close the card out from under it.
  const [open, setOpen] = useState(false)
  const [openFigure, setOpenFigure] = useState<string | null>(null)
  const bodyId = useId()

  /**
   * The headline figures, each with what it is made of.
   *
   * The detail is the platform split the figure was summed from — the answer to
   * "who spent that" without reading the table underneath. A ratio has no
   * platforms to split into, so it lists the two figures it was divided from
   * instead, which is the only honest breakdown of a quotient.
   */
  const figures: FigureSpec[] = []
  if (metrics) {
    const spend = metrics.spend.value

    figures.push({
      key: 'spend',
      label: 'Spend',
      value: formatCurrency(spend),
      change: metrics.spend.deltaPct,
      previous: prevSpend === null ? undefined : formatCurrency(prevSpend),
      polarity: 'down-good',
      detail: platforms.map((p) => ({
        label: p.name,
        value: `${formatCurrency(p.metrics.spend.value)}${
          spend > 0 ? ` · ${formatPercent(p.metrics.spend.value / spend)}` : ''
        }`,
      })),
    })

    figures.push({
      key: 'spend-per-day',
      label: 'Spend / day',
      value: formatCurrency(spendPerDay),
      change: prevSpendPerDay === null ? null : deltaPct(spendPerDay, prevSpendPerDay),
      previous: prevSpendPerDay === null ? undefined : formatCurrency(prevSpendPerDay),
      polarity: 'down-good',
      detail: [
        { label: `${days} days in period`, value: formatCurrency(spend) },
        ...platforms.map((p) => ({
          label: p.name,
          value: `${formatCurrency(p.metrics.spend.value / days)} / day`,
        })),
      ],
    })

    figures.push({
      key: 'roas',
      label: 'ROAS',
      // An em dash rather than 0x where no platform attributes: a return that
      // was never reported is not a return of none.
      value: attributed ? formatRoas(metrics.roas.value) : '—',
      change: attributed ? metrics.roas.deltaPct : null,
      previous: attributed && prevRoas !== null ? formatRoas(prevRoas) : undefined,
      detail: [
        ...platforms.map((p) => ({
          label: p.name,
          value:
            p.metrics.reportsConversions === false
              ? 'reports no attribution'
              : formatRoas(p.metrics.roas.value),
        })),
        ...(unattributed.length > 0
          ? [
              {
                label: 'Struck against',
                value: `the platforms that attribute, not ${unattributed.join(' or ')}`,
              },
            ]
          : []),
      ],
    })
  }

  if (blended) {
    // Recovered from the ratio rather than passed alongside it: the two are the
    // same division, and a sales figure carried separately could disagree with
    // the return it is supposed to explain.
    const storeSales = blended.blendedRoas * blended.spend

    figures.push({
      key: 'blended-roas',
      label: 'Blended ROAS',
      value: formatRoas(blended.blendedRoas),
      change: blended.previous
        ? deltaPct(blended.blendedRoas, blended.previous.blendedRoas)
        : null,
      previous: blended.previous ? formatRoas(blended.previous.blendedRoas) : undefined,
      detail: [
        { label: 'Store sales', value: formatCurrency(storeSales) },
        { label: 'Ad spend, every platform', value: formatCurrency(blended.spend) },
        { label: 'Cost per order', value: formatCurrency(blended.costPerOrder) },
      ],
    })

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
      polarity: 'down-good',
      detail: [
        { label: 'Ad spend', value: formatCurrency(blended.spend) },
        { label: 'Store sales', value: formatCurrency(storeSales) },
      ],
    })
  }

  const shown = figures.find((f) => f.key === openFigure)

  /**
   * The card in one line, for when it is closed.
   *
   * What was spent and what came back — the two questions the card exists to
   * answer. A reader who wants no more than that should not have to open
   * anything, and a closed card showing only its own name says nothing at all.
   */
  const headline = (() => {
    if (loading) return 'Loading…'
    if (!metrics) return 'No ad platform reported for this period.'

    const move =
      metrics.spend.deltaPct === null
        ? ''
        : `, ${metrics.spend.deltaPct >= 0 ? 'up' : 'down'} ${formatDeltaPercent(
            Math.abs(metrics.spend.deltaPct),
          )}`
    const back = blended
      ? ` · ${formatRoas(blended.blendedRoas)} blended return`
      : attributed
        ? ` · ${formatRoas(metrics.roas.value)} reported return`
        : ''
    return `${formatCurrency(metrics.spend.value)} spent${move}${back}`
  })()

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
            <span className="mt-1 block text-[12px] text-muted">{headline}</span>
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

      <div id={bodyId} hidden={!open}>
        <div className="min-w-0">
          {/* The figures the card exists to report, under the name of it.
              Everything below is these broken apart; a reader after nothing
              more than "what did we spend and what came back" should not have
              to read a table to find out. */}
          {!loading && figures.length > 0 && (
            /* Two to a line, as boxes: see the note on the CEO card's strip. */
            <div className="mt-2 grid grid-cols-2 gap-2">
              {figures.map((figure) => (
                <HeadlineFigure
                  key={figure.key}
                  figure={figure}
                  open={openFigure === figure.key}
                  onToggle={() =>
                    setOpenFigure((current) =>
                      current === figure.key ? null : figure.key,
                    )
                  }
                />
              ))}
            </div>
          )}

          {shown && shown.detail.length > 0 && (
            <dl className="mt-2 flex flex-col rounded-lg border border-btn-border bg-btn px-3 py-2">
              {shown.detail.map((row) => (
                <div
                  key={row.label}
                  className="flex items-baseline justify-between gap-4 border-b border-row-line py-1 text-[11px] last:border-0"
                >
                  <dt className="min-w-0 truncate text-muted">{row.label}</dt>
                  <dd className="shrink-0 tabular-nums text-ink">{row.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {subtitle && <p className="mt-2 text-[12px] text-muted">{subtitle}</p>}
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

/** One headline figure and the breakdown behind it. */
interface FigureSpec {
  key: string
  label: string
  value: string
  change: number | null
  /** Pre-formatted figure for the comparison window; omitted when it is off. */
  previous?: string
  polarity?: Polarity
  detail: { label: string; value: string }[]
}

/**
 * A figure carried up beside the card's name, in a box that opens what it is
 * made of.
 *
 * The baseline reads inline after the change rather than under it — `+11.5% vs
 * $2,890.30` is one sentence, where a figure on a second line is a second
 * thing to look at and doubles the height of every headline on the card.
 */
function HeadlineFigure({
  figure,
  open,
  onToggle,
}: {
  figure: FigureSpec
  open: boolean
  onToggle: () => void
}) {
  const { label, value, change, previous, polarity = 'up-good', detail } = figure
  const openable = detail.length > 0

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!openable}
      aria-expanded={open}
      className={`min-w-0 rounded-lg border px-2.5 py-2 text-left transition-colors ${
        open ? 'border-[#3a3a40] bg-btn' : 'border-btn-border hover:border-[#3a3a40]'
      } disabled:cursor-default disabled:hover:border-btn-border`}
    >
      {/* Label above, figure below: two to a line the box is too narrow to set
          them side by side, and a label that truncated would leave a figure
          nobody could name. */}
      <div className="flex items-center gap-1 text-[10.5px] uppercase tracking-wide text-label">
        <span className="min-w-0 truncate">{label}</span>
        {openable && (
          <ChevronDown
            size={10}
            className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        )}
      </div>
      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-[14px] font-semibold tabular-nums text-ink">{value}</span>
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
        {previous !== undefined && (
          <span className="text-[11px] tabular-nums text-label">vs {previous}</span>
        )}
      </div>
    </button>
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
