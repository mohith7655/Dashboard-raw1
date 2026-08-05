import { useMemo } from 'react'
import { ArrowDown, ArrowUp, TrendingUp } from 'lucide-react'
import type {
  AdsMetrics,
  DateRange,
  OperatingCost,
  Polarity,
  ProfitAndLoss,
  WooMetrics,
} from '../../lib/types'
import { costLines, totalOperatingCost } from '../../lib/operatingCosts'
import { deltaPct, round2 } from '../../lib/derive'
import { formatCurrency, formatDeltaPercent, formatPercent } from '../../lib/format'
import { Skeleton } from '../Skeleton'

interface ProfitSummaryCardProps {
  woo: WooMetrics | undefined
  /** Platforms that actually reported; a failed one is left out, not zeroed. */
  reportedAds: { name: string; metrics: AdsMetrics }[]
  costs: OperatingCost[] | undefined
  range: DateRange
  /** The window every line is compared against, or null when comparison is off. */
  against: DateRange | null
  loading: boolean
  failed: boolean
}

/**
 * A heading figure, one of the movements that produced it, or a resting point
 * partway down a group.
 */
interface Line {
  label: string
  /** The figure itself; the sign lives in `valueLabel`. */
  amount: number
  kind: 'total' | 'subtotal' | 'part'
  /** Pre-formatted, carrying a sign only where the sign means something. */
  valueLabel: string
  /**
   * Which direction reads as good. A statement mixes both: revenue rising is
   * green, cost rising is red, and colouring every increase alike would
   * congratulate the store on its coupons.
   */
  polarity: Polarity
}

/** Everything a statement is built from, for either window. */
interface StatementInput {
  pnl: ProfitAndLoss
  totalCost: number
  adSpend: number | null
  operatingCost: number
}

/**
 * The statement in full, opening on total revenue and breaking down from there.
 *
 * The Profit tab's waterfall runs in accumulation order — gross sales, then
 * each adjustment, arriving at total revenue — because a waterfall has to, its
 * bars being a running balance. A statement does not: the figure everyone
 * recognises goes first, and the lines that make it up sit underneath. Same
 * numbers, read from the other end.
 *
 * Built identically for the selected period and the comparison window, so the
 * two can be paired line by line.
 */
function buildStatement({
  pnl,
  totalCost,
  adSpend,
  operatingCost,
}: StatementInput): Line[] {
  const lines: Line[] = []

  const total = (label: string, amount: number, polarity: Polarity = 'up-good') => {
    lines.push({
      label,
      amount,
      kind: 'total',
      valueLabel: formatCurrency(amount),
      polarity,
    })
  }

  const subtotal = (label: string, amount: number, polarity: Polarity = 'up-good') => {
    lines.push({
      label,
      amount,
      kind: 'subtotal',
      valueLabel: formatCurrency(amount),
      polarity,
    })
  }

  // Zero movements are dropped rather than listed flat — a period with no
  // coupons should not have to read a coupon line to find that out.
  //
  // `always` exempts a line from that: refunds are looked for whether or not
  // there were any, and a line silently absent is indistinguishable from one
  // that failed to report. An explicit zero answers the question.
  const part = (
    label: string,
    amount: number,
    sign: '+' | '−' | '',
    polarity: Polarity = 'up-good',
    always = false,
  ) => {
    const value = round2(amount)
    if (value === 0 && !always) return
    lines.push({
      label,
      amount: value,
      kind: 'part',
      valueLabel: `${sign}${formatCurrency(Math.abs(value))}`,
      polarity,
    })
  }

  const refunds = round2(pnl.refunds)

  total('Total revenue', pnl.totalRevenue)
  part('Gross sales', pnl.grossSales, '')
  // More coupons is worse, so its polarity inverts against the group's.
  part('Coupons', pnl.discounts, '−', 'down-good')
  // Sales after the coupons come off, before shipping and tax are added on.
  // It sits below the deduction that produces it rather than above it, and
  // only when there were coupons — with none it would restate gross sales.
  if (round2(pnl.discounts) !== 0) {
    subtotal('Net sales', round2(pnl.grossSales - pnl.discounts))
  }
  part('Shipping charged', pnl.shippingCharged, '+')
  part('Tax collected', pnl.taxCollected, '+')
  // A refund is money handed back, not a cost of trading, so it belongs to the
  // revenue section rather than down among the overheads.
  part('Refunds', refunds, '−', 'down-good', true)
  if (refunds !== 0) {
    subtotal('Net revenue', round2(pnl.totalRevenue - refunds))
  }

  total('Total cost', totalCost, 'down-good')
  part('Product cost', pnl.productCost, '−', 'down-good')
  part('Shipping cost', pnl.shippingCost, '−', 'down-good')
  part('Transaction fees', pnl.transactionCost, '−', 'down-good')
  part('Other costs', pnl.otherCost, '−', 'down-good')

  total('Gross profit', pnl.grossProfit)
  // Absent rather than zero when no platform reported, so the line never
  // claims the store advertised for nothing.
  if (adSpend !== null) part('Ad spend', adSpend, '−', 'down-good')
  part('Operating costs', operatingCost, '−', 'down-good')

  total(
    'Net profit',
    round2(pnl.grossProfit - refunds - (adSpend ?? 0) - operatingCost),
  )

  return lines
}

/**
 * The figure everything else is a share of: whichever of gross sales and total
 * revenue is larger.
 *
 * Neither one is reliably the bigger. Coupons pull total revenue below gross
 * sales; shipping and tax push it above. Taking the smaller as 100% would make
 * the other read over it, so the top of the statement is chosen rather than
 * assumed, and no line can then exceed 100%.
 */
const topLine = (pnl: ProfitAndLoss): { label: string; amount: number } =>
  pnl.grossSales >= pnl.totalRevenue
    ? { label: 'Gross sales', amount: pnl.grossSales }
    : { label: 'Total revenue', amount: pnl.totalRevenue }

/** The four cost lines a statement subtracts, for a window with no `totalCost`. */
const costsOf = (pnl: ProfitAndLoss): number =>
  round2(pnl.productCost + pnl.shippingCost + pnl.transactionCost + pnl.otherCost)

export function ProfitSummaryCard({
  woo,
  reportedAds,
  costs,
  range,
  against,
  loading,
  failed,
}: ProfitSummaryCardProps) {
  const adSpend = reportedAds.length
    ? reportedAds.reduce((sum, p) => sum + p.metrics.spend.value, 0)
    : null

  // Only platforms that reported a comparison window contribute to its total;
  // a missing baseline counted as zero would invent growth.
  const prevAds = reportedAds.filter((p) => p.metrics.previousTotals)
  const prevAdSpend = prevAds.length
    ? prevAds.reduce((sum, p) => sum + (p.metrics.previousTotals?.spend ?? 0), 0)
    : null

  const operatingCost = useMemo(
    () => totalOperatingCost(costLines(costs ?? [], range)),
    [costs, range],
  )

  // The same saved costs prorated onto the comparison window instead — a
  // subscription taken out last month did not apply the month before.
  const prevOperatingCost = useMemo(
    () => (against ? totalOperatingCost(costLines(costs ?? [], against)) : 0),
    [costs, against],
  )

  const lines = useMemo(
    () =>
      woo
        ? buildStatement({
            pnl: woo.pnl,
            totalCost: woo.totalCost.value,
            adSpend,
            operatingCost,
          })
        : [],
    [woo, adSpend, operatingCost],
  )

  // Paired by label rather than by position: a line dropped for being zero in
  // one window but not the other would otherwise shift every delta below it.
  const previousByLabel = useMemo(() => {
    if (!woo?.pnlPrevious) return null
    const previous = buildStatement({
      pnl: woo.pnlPrevious,
      totalCost: costsOf(woo.pnlPrevious),
      adSpend: prevAdSpend,
      operatingCost: prevOperatingCost,
    })
    return new Map(previous.map((line) => [line.label, line.amount]))
  }, [woo, prevAdSpend, prevOperatingCost])

  const changeOf = (line: Line): number | null => {
    const before = previousByLabel?.get(line.label)
    return before === undefined ? null : deltaPct(line.amount, before)
  }

  const top = woo ? topLine(woo.pnl) : null
  const base = top?.amount ?? 0
  const share = (amount: number): number => (base === 0 ? 0 : Math.abs(amount) / base)
  const anyChange = lines.some((line) => changeOf(line) !== null)

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="kpi-label truncate">{top?.label ?? 'Gross sales'}</div>

          <div className="mt-2">
            {loading ? (
              <Skeleton className="h-[30px] w-40" />
            ) : (
              <div className="kpi-value truncate">
                {failed || !top ? '—' : formatCurrency(top.amount)}
              </div>
            )}
          </div>
        </div>

        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-icon-btn text-muted">
          <TrendingUp size={15} strokeWidth={2} />
        </span>
      </div>

      {loading ? (
        <div className="mt-4 flex flex-col gap-2 border-t border-row-line pt-3">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-full" />
        </div>
      ) : failed || lines.length === 0 ? (
        <p className="mt-4 border-t border-row-line pt-3 text-[12px] text-muted">
          Profit data unavailable for this period.
        </p>
      ) : (
        // On a narrow screen the label, figure, change and share cannot all
        // fit; the rows scroll sideways rather than wrapping a statement into
        // unreadable shapes or truncating the figures themselves.
        <div className="mt-4 overflow-x-auto border-t border-row-line pt-1">
          <dl className={`flex flex-col ${anyChange ? 'min-w-[23rem]' : 'min-w-[17rem]'}`}>
            {lines.map((line, index) => (
              <StatementRow
                key={`${line.label}-${index}`}
                line={line}
                share={share(line.amount)}
                change={changeOf(line)}
                showChange={anyChange}
              />
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}

function changeColor(deltaPctValue: number, polarity: Polarity): string {
  if (polarity === 'neutral' || deltaPctValue === 0) return 'text-muted'
  const good = polarity === 'down-good' ? deltaPctValue < 0 : deltaPctValue > 0
  return good ? 'text-pos' : 'text-neg'
}

/**
 * Totals sit flush and carry a rule; the movements under them are indented and
 * muted, so the shape of the statement reads before any number does.
 */
function StatementRow({
  line,
  share,
  change,
  showChange,
}: {
  line: Line
  share: number
  change: number | null
  showChange: boolean
}) {
  const total = line.kind === 'total'
  // A subtotal stays indented with the movements it sums, but in the ink the
  // totals use — it is a figure to rest on, not another adjustment.
  const strong = total || line.kind === 'subtotal'

  return (
    // Columns are packed to the left rather than pushed to both edges. Spread
    // across the card, a line's figure ended up an inch or more from the label
    // that names it, and the eye had to cross an empty gap that grew with the
    // width of the card. The slack now sits at the end of the row instead.
    <div
      className={`flex items-baseline gap-2 py-1 ${
        total ? 'border-t border-row-line first:border-0' : ''
      }`}
    >
      <dt
        className={`w-[8.5rem] shrink-0 truncate ${total ? '' : 'pl-3'} ${
          strong ? 'text-[12px] font-medium text-ink' : 'text-[11px] text-muted'
        }`}
      >
        {line.label}
      </dt>
      <dd className="flex shrink-0 items-baseline gap-2">
        {/* A floor rather than a fixed width: the figures line up at the
            magnitudes a statement actually holds, and an unusually large one
            widens its column instead of being clipped. */}
        <span
          className={`min-w-[5.5rem] text-right tabular-nums ${
            strong ? 'text-[12px] font-semibold text-ink' : 'text-[11px] text-muted'
          }`}
        >
          {line.valueLabel}
        </span>
        {/* This period's share sits next to the figure it describes — the two
            are the same fact in different units — and the movement against the
            comparison window follows, being about a different period. */}
        <span
          className={`w-12 text-right text-[11px] tabular-nums ${
            strong ? 'text-[#9a9aa2]' : 'text-muted'
          }`}
        >
          {formatPercent(share)}
        </span>
        {/* Each column holds its width even when a line has no figure for it,
            so one gap cannot shunt the column beside it out of alignment. */}
        {showChange && (
          <span
            className={`flex w-[4.5rem] items-center justify-end gap-0.5 text-[11px] tabular-nums ${
              change === null ? 'text-muted' : changeColor(change, line.polarity)
            }`}
          >
            {change !== null && (
              <>
                {change < 0 ? <ArrowDown size={10} strokeWidth={3} /> : <ArrowUp size={10} strokeWidth={3} />}
                {formatDeltaPercent(change)}
              </>
            )}
          </span>
        )}
      </dd>
    </div>
  )
}
