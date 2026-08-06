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
  /**
   * The same figure as the statement reads it, sign included — a deduction is
   * negative here though `amount` carries only its magnitude. The share is
   * taken from this, so a line that subtracts reads as a negative share and
   * cannot be mistaken for one that adds.
   */
  signed: number
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
  adSpend: number | null
  operatingCost: number
}

/**
 * The statement in full, opening on total sales and breaking down from there.
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
  adSpend,
  operatingCost,
}: StatementInput): Line[] {
  const lines: Line[] = []

  // `negative` marks a heading that is money leaving rather than money held —
  // it prints with a minus and takes a negative share, as its own lines do,
  // while `amount` stays a magnitude so the comparison measures the cost
  // rising or falling rather than flipping sign against the other window.
  const total = (
    label: string,
    amount: number,
    polarity: Polarity = 'up-good',
    negative = false,
  ) => {
    lines.push({
      label,
      amount,
      signed: negative ? -Math.abs(amount) : amount,
      kind: 'total',
      valueLabel: negative
        ? `−${formatCurrency(Math.abs(amount))}`
        : formatCurrency(amount),
      polarity,
    })
  }

  // Struck in the totals' ink but indented with the movements it sums: a
  // figure to rest on partway down a group, not another adjustment.
  const subtotal = (label: string, amount: number, polarity: Polarity = 'up-good') => {
    lines.push({
      label,
      amount,
      signed: amount,
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
      signed: sign === '−' ? -Math.abs(value) : value,
      kind: 'part',
      valueLabel: `${sign}${formatCurrency(Math.abs(value))}`,
      polarity,
    })
  }

  const refunds = round2(pnl.refunds)
  const netSales = netSalesOf(pnl)
  const totalSales = totalSalesOf(pnl)
  const revenue = revenueOf(pnl)
  // The three charges that ride on the goods. Taken from the lines themselves
  // rather than from the payload's `totalCost`, which also carries Metorik's
  // extra costs and would leave the heading naming more than it lists.
  const cogs = round2(pnl.productCost + pnl.shippingCost + pnl.transactionCost)
  // What the sale left after the cost of the goods sold. Struck from revenue
  // rather than total sales: money handed back was never the store's to take a
  // margin on.
  const grossProfit = round2(revenue - cogs)

  // The statement's base, so every share below answers "what part of what we
  // billed is this".
  total('Total sales', totalSales)
  part('Gross sales', grossSalesOf(pnl), '')
  // More coupons is worse, so its polarity inverts against the group's.
  part('Coupons', pnl.discounts, '−', 'down-good')
  // Shown only where the lines under it move it: with no shipping or tax it
  // would restate total sales under a second name.
  if (netSales !== totalSales) {
    subtotal('Net sales', netSales)
  }
  part('Shipping charged', pnl.shippingCharged, '+')
  part('Tax collected', pnl.taxCollected, '+')
  // A refund is money handed over and returned, not a cost of trading, so it
  // comes off the sale rather than down among the overheads. It is deducted
  // here and nowhere else — every line above is before refunds. It sits below
  // total sales rather than inside it, the way advertising sits below gross
  // profit: a deduction on the way to the next heading, not a part of the one
  // above.
  part('Refunds', refunds, '−', 'down-good', true)
  total('Revenue', revenue)

  // The cost of the goods themselves: what was bought, what it cost to ship,
  // and what the processor took. Advertising and operations are costs of
  // running the store rather than of the goods, so they stay below the gross
  // profit line instead of inside this one.
  total('Cost of goods sold', cogs, 'down-good', true)
  part('Product cost', pnl.productCost, '−', 'down-good')
  part('Shipping cost', pnl.shippingCost, '−', 'down-good')
  part('Transaction cost', pnl.transactionCost, '−', 'down-good')
  // A heading in its own right, flush with total sales and cost of goods sold:
  // the statement's three landmarks, each with what produced it underneath.
  //
  // Struck from the total sales line rather than from the payload's own gross
  // profit, which is taken before refunds and against a sales figure this
  // statement no longer shows. Two figures a few rows apart that do not
  // subtract to the one between them is how a statement stops being believed.
  total('Gross profit', grossProfit)
  // Absent rather than zero when no platform reported, so the line never
  // claims the store advertised for nothing.
  if (adSpend !== null) part('Advertising cost', adSpend, '−', 'down-good')
  part('Operational cost', operatingCost, '−', 'down-good')

  // Refunds are not subtracted again here: they came off at total sales, and
  // gross profit is struck from that.
  total('Net profit', round2(grossProfit - (adSpend ?? 0) - operatingCost))

  return lines
}

/**
 * Gross sales: the goods as they were billed, before any coupon came off and
 * before anything was handed back.
 *
 * Nothing is adjusted here. The payload figure already covers the goods alone —
 * shipping and tax are never inside it — so the coupons used to be added a
 * second time and the shipping and tax subtracted out of a figure that had
 * never held them, which between them put this line $233.65 above the truth on
 * a single week.
 */
const grossSalesOf = (pnl: ProfitAndLoss): number => round2(pnl.grossSales)

/**
 * What the goods themselves earned: gross sales less the coupons, and nothing
 * else.
 *
 * Shipping and tax are no part of it — they are money the customer handed over
 * on top, and are added after, on the way to total sales. Refunds are no part
 * of it either; they come off once, at total revenue, where the money left.
 */
const netSalesOf = (pnl: ProfitAndLoss): number =>
  round2(grossSalesOf(pnl) - pnl.discounts)

/** Net sales plus the shipping and tax charged on top of it: what was billed. */
const totalSalesOf = (pnl: ProfitAndLoss): number =>
  round2(netSalesOf(pnl) + pnl.shippingCharged + pnl.taxCollected)

/** What was billed, less what was handed back: the money the store kept. */
const revenueOf = (pnl: ProfitAndLoss): number =>
  round2(totalSalesOf(pnl) - round2(pnl.refunds))

/**
 * The figure everything else is a share of: total sales, what the store billed
 * over the period.
 *
 * The base is the billed figure rather than the kept one so that every share
 * answers the same question — "what part of what we sold is this" — and the
 * deductions read as fractions of the thing they come off. Gross sales still
 * stands above it, reading over 100% by the coupons, which is the point of
 * measuring against a named total rather than against the widest line.
 */
const topLine = (pnl: ProfitAndLoss): { label: string; amount: number } => ({
  label: 'Total sales',
  amount: totalSalesOf(pnl),
})

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
  // Signed, so a deduction reads `−13.6%` beside its `−$448.18`. A share
  // printed bare made a line that comes off the total look like one that adds
  // to it, which is the one thing the figure beside it already says.
  const share = (line: Line): number => (base === 0 ? 0 : line.signed / base)
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
          <dl className={`flex flex-col ${anyChange ? 'min-w-[20rem]' : 'min-w-[14.5rem]'}`}>
            {lines.map((line, index) => (
              <StatementRow
                key={`${line.label}-${index}`}
                line={line}
                share={share(line)}
                change={changeOf(line)}
                showChange={anyChange}
                // The line the statement opens on, and the one every share is
                // measured against. It carries a little more weight than the
                // headings below it for both reasons.
                lead={index === 0}
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
  lead = false,
}: {
  line: Line
  share: number
  change: number | null
  showChange: boolean
  /** The statement's opening line, set a size above the headings below it. */
  lead?: boolean
}) {
  const total = line.kind === 'total'
  // A subtotal stays indented with the movements it sums, but in the ink the
  // totals use — it is a figure to rest on, not another adjustment.
  const strong = total || line.kind === 'subtotal'
  const strongSize = lead ? 'text-[13.5px]' : 'text-[12px]'

  return (
    // Columns are packed to the left rather than pushed to both edges. Spread
    // across the card, a line's figure ended up an inch or more from the label
    // that names it, and the eye had to cross an empty gap that grew with the
    // width of the card. The slack now sits at the end of the row instead.
    <div
      className={`flex items-baseline gap-1.5 py-1 ${
        total ? 'border-t border-row-line first:border-0' : ''
      }`}
    >
      <dt
        title={line.label}
        className={`w-[7.5rem] shrink-0 truncate ${total ? '' : 'pl-2.5'} ${
          strong ? `${strongSize} font-medium text-ink` : 'text-[11px] text-muted'
        }`}
      >
        {line.label}
      </dt>
      <dd className="flex shrink-0 items-baseline gap-1.5">
        {/* A floor rather than a fixed width: the figures line up at the
            magnitudes a statement actually holds, and an unusually large one
            widens its column instead of being clipped. */}
        <span
          className={`min-w-[4.75rem] text-right tabular-nums ${
            strong ? `${strongSize} font-semibold text-ink` : 'text-[11px] text-muted'
          }`}
        >
          {line.valueLabel}
        </span>
        {/* This period's share sits next to the figure it describes — the two
            are the same fact in different units — and the movement against the
            comparison window follows, being about a different period. */}
        <span
          className={`w-11 text-right text-[11px] tabular-nums ${
            strong ? 'text-[#9a9aa2]' : 'text-muted'
          }`}
        >
          {formatPercent(share)}
        </span>
        {/* Each column holds its width even when a line has no figure for it,
            so one gap cannot shunt the column beside it out of alignment. */}
        {showChange && (
          <span
            className={`flex w-[4rem] items-center justify-end gap-0.5 text-[11px] tabular-nums ${
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
