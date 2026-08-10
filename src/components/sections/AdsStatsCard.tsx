import { ArrowDown, ArrowUp, Megaphone } from 'lucide-react'
import type { AdsMetrics, DateRange, Polarity } from '../../lib/types'
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
  blended: {
    blendedRoas: number
    shareOfRevenue: number
    previous: { blendedRoas: number; shareOfRevenue: number } | null
  } | null
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

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* The figures the card exists to report, up beside the name of it.
              Everything below is these broken apart; a reader after nothing
              more than "what did we spend and what came back" should not have
              to read a table to find out.

              The daily rate sits with the total rather than under it: a spend
              figure means one thing over a week and another over a quarter, and
              the two read together say which. */}
          <div className="flex flex-wrap items-start gap-x-5 gap-y-2">
            <span className="kpi-label">All ads</span>
            {!loading && metrics && (
              <>
                <HeadlineFigure
                  label="Spend"
                  value={formatCurrency(metrics.spend.value)}
                  change={metrics.spend.deltaPct}
                  previous={prevSpend === null ? undefined : formatCurrency(prevSpend)}
                  polarity="down-good"
                />
                <HeadlineFigure
                  label="Spend / day"
                  value={formatCurrency(spendPerDay)}
                  change={
                    prevSpendPerDay === null ? null : deltaPct(spendPerDay, prevSpendPerDay)
                  }
                  previous={
                    prevSpendPerDay === null ? undefined : formatCurrency(prevSpendPerDay)
                  }
                  polarity="down-good"
                />
                <HeadlineFigure
                  label="ROAS"
                  // An em dash rather than 0x where no platform attributes:
                  // a return that was never reported is not a return of none.
                  value={attributed ? formatRoas(metrics.roas.value) : '—'}
                  change={attributed ? metrics.roas.deltaPct : null}
                  previous={
                    attributed && prevRoas !== null ? formatRoas(prevRoas) : undefined
                  }
                />
                {/* Up here with the rest rather than at the foot of the table:
                    these are the two figures that answer whether the spend was
                    worth it, and they were the last thing on the card. */}
                {blended && (
                  <>
                    <HeadlineFigure
                      label="Blended ROAS"
                      value={formatRoas(blended.blendedRoas)}
                      change={
                        blended.previous
                          ? deltaPct(blended.blendedRoas, blended.previous.blendedRoas)
                          : null
                      }
                      previous={
                        blended.previous ? formatRoas(blended.previous.blendedRoas) : undefined
                      }
                    />
                    <HeadlineFigure
                      label="Spend % of sales"
                      value={formatPercent(blended.shareOfRevenue)}
                      change={
                        blended.previous
                          ? deltaPct(blended.shareOfRevenue, blended.previous.shareOfRevenue)
                          : null
                      }
                      previous={
                        blended.previous
                          ? formatPercent(blended.previous.shareOfRevenue)
                          : undefined
                      }
                      polarity="down-good"
                    />
                  </>
                )}
              </>
            )}
          </div>
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

/**
 * A figure carried up onto the title row, its label kept quiet beside it.
 *
 * The movement and the figure it moved from travel with it. A percentage on its
 * own says a direction and a size but not a scale — `+40%` off a base nobody
 * can see is unreadable — so the previous window's figure is printed under it
 * rather than left to the table below, which no longer carries these at all.
 */
function HeadlineFigure({
  label,
  value,
  change = null,
  previous,
  polarity = 'up-good',
}: {
  label: string
  value: string
  change?: number | null
  /** Pre-formatted figure for the comparison window; omitted when it is off. */
  previous?: string
  polarity?: Polarity
}) {
  return (
    <span className="flex flex-col">
      <span className="flex items-baseline gap-1.5">
        <span className="text-[11px] uppercase tracking-[0.06em] text-label">{label}</span>
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
      </span>
      {previous !== undefined && (
        <span className="text-[10.5px] tabular-nums text-label">was {previous}</span>
      )}
    </span>
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
