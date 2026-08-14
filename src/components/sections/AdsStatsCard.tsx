import { useId, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown } from 'lucide-react'
import type { AdsMetrics, Polarity } from '../../lib/types'
import type { BlendedAds } from '../../lib/pnl'
import { nonAttributing } from '../../lib/pnl'
import { deltaPct } from '../../lib/derive'
import {
  formatCtr,
  formatCurrency,
  formatDeltaPercent,
  formatInteger,
  formatDifference,
  formatPercent,
  formatPrevious as was,
  formatRoas,
} from '../../lib/format'
import {
  AnalyseButton,
  SectionAnalysis,
  type SectionAnalysisWiring,
} from '../SectionAnalysis'
import { StatRows, type StatRowData } from '../StatRows'
import { Skeleton } from '../Skeleton'

interface AdsStatsCardProps {
  /** Every reporting platform added together, or undefined if none did. */
  metrics: AdsMetrics | undefined
  /** The platforms behind that total, each splitting the row above it. */
  platforms: { name: string; metrics: AdsMetrics }[]
  /**
   * Spend set against the store's own revenue. Null where Metorik failed —
   * the share would then be struck against a revenue nobody has.
   */
  blended: BlendedAds | null
  /** Named rather than implied when only one platform reported. */
  subtitle: string
  loading: boolean
  /** The AI review of this card, wired the same way the Leads section is. */
  analysis: SectionAnalysisWiring
  /**
   * The card's own date picker, when it carries one.
   *
   * Passed in rather than held here: the range it sets has to reach the
   * queries, and those live where the rest of the page's data does.
   */
  rangeControl?: React.ReactNode
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
  analysis,
  rangeControl,
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

  const [analysisOpen, setAnalysisOpen] = useState(false)
  const analysisId = useId()

  /**
   * Exactly what this card is rendering: the combined account, each platform
   * behind it, and both comparison windows.
   *
   * Sent from the totals rather than from the campaign lists — a campaign
   * table would multiply the payload without changing any answer the card can
   * be asked, and the platform split is where the decisions actually are.
   */
  const snapshotOf = (): Record<string, unknown> => ({
    currency: 'USD',
    combined: metrics
      ? {
          spend: metrics.spend,
          impressions: metrics.impressions,
          clicks: metrics.clicks,
          ctr: metrics.ctr,
          roas: metrics.roas,
          cpc: metrics.cpc,
          cpm: metrics.cpm,
          conversions: metrics.conversions,
          reportsConversions: metrics.reportsConversions,
        }
      : null,
    platforms: platforms.map(({ name, metrics: m }) => ({
      name,
      spend: m.spend,
      clicks: m.clicks,
      ctr: m.ctr,
      roas: m.roas,
      cpc: m.cpc,
      conversions: m.conversions,
      // Named so a platform that attributes nothing is not read as one that
      // sold nothing — the same distinction the table below draws.
      reportsConversions: m.reportsConversions,
    })),
    platformsNotAttributing: unattributed,
    blended: blended
      ? {
          spend: blended.spend,
          blendedRoas: blended.blendedRoas,
          shareOfRevenue: blended.shareOfRevenue,
          costPerOrder: blended.costPerOrder,
          previous: blended.previous,
        }
      : null,
    scope: subtitle,
  })

  /**
   * The two figures the card leads on: what was spent, and what share of sales
   * that was.
   *
   * The return the platforms claim is not among them. It reads on the CEO
   * statement already, next to the blended figure that qualifies it, and a
   * return quoted here on its own — struck from the narrower base of the
   * platforms that attribute at all — is the one figure on this card most
   * likely to be read as the store's. It is still in the table below, beside
   * the note saying which platforms it leaves out.
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
    const priorShare = blended.previous?.shareOfRevenue ?? null
    figures.push({
      key: 'spend-share',
      label: 'Spend % of sales',
      value: formatPercent(blended.shareOfRevenue),
      change:
        priorShare === null ? null : deltaPct(blended.shareOfRevenue, priorShare),
      previous: priorShare === null ? undefined : formatPercent(priorShare),
      difference:
        priorShare === null
          ? undefined
          : formatDifference(blended.shareOfRevenue - priorShare, formatPercent),
      polarity: 'down-good',
    })
  }

  return (
    // The CEO dashboard is deliberately unframed: its individual metric boxes
    // carry the hierarchy. All ads uses that same surface so it reads as part
    // of the dashboard, not as a separate panel with its own background.
    <div>
      {/* The whole title row opens the table, as the coupon card's does — the
          chevron sits out on the right rather than tucked against the label,
          so the target is the row and not four words of it. */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="group min-w-0 flex-1 text-left"
        >
          <span className="kpi-label block truncate transition-colors group-hover:text-ink">
            All ads
          </span>
        </button>

        {/* Sparkles then chevron, as on the CEO Dashboard — and nothing after
            them. The megaphone that closed this row was decoration: it named
            a card whose own label already says "All ads" two inches to the
            left, and it was the one glyph on the row that did nothing when
            clicked.

            The label and the chevron are two buttons rather than one wrapping
            both, because the analyse control has to sit between them and
            nesting a button inside a button is invalid. They share a handler,
            so which half of the row is clicked makes no difference. */}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          {rangeControl}
          <AnalyseButton
            open={analysisOpen}
            panelId={analysisId}
            label="all ads"
            onToggle={() => setAnalysisOpen((current) => !current)}
            running={analysis.running}
            disabled={loading}
          />
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            aria-controls={bodyId}
            aria-label={open ? 'Hide the ad platforms' : 'Show the ad platforms'}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-btn hover:text-ink"
          >
            <ChevronDown
              size={15}
              className={`transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      </div>

      <SectionAnalysis
        section="ads"
        label="All ads"
        open={analysisOpen}
        panelId={analysisId}
        prompt={analysis.prompt}
        onSavePrompt={analysis.onSavePrompt}
        savingPrompt={analysis.savingPrompt}
        promptError={analysis.promptError}
        onAnalyse={(prompt) => analysis.onAnalyse(prompt, snapshotOf())}
        running={analysis.running}
        result={analysis.result}
        analysisError={analysis.analysisError}
        className="mt-3"
      />

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
              ROAS. Blended ROAS in the CEO dashboard includes their spend, since it measures
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
      {/* Both comparison figures on one line — what it was, then how far it
          moved. Matches the boxes in the CEO statement beside it, which is the
          point: two cards in one section should not count their lines
          differently. */}
      {(previous !== undefined || difference !== undefined) && (
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[11px] tabular-nums">
          {previous !== undefined && (
            <span className="text-label">{previous}</span>
          )}
          {difference !== undefined && (
            <span className="text-[#5a5a62]">{difference}</span>
          )}
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

  group('ROAS', 'roas', formatRoas)
  group('Spend', 'spend', formatCurrency)
  group('Impressions', 'impressions', formatInteger)
  group('Clicks', 'clicks', formatInteger)
  group('CTR', 'ctr', formatCtr)
  group('CPC', 'cpc', formatCurrency)
  group('CPM', 'cpm', formatCurrency)
  group('Conversions', 'conversions', formatInteger)

  // Blended ROAS and spend as a share of sales belong to the CEO dashboard,
  // where they can be read against the store revenue they qualify.
  return rows
}
