import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown } from 'lucide-react'
import type {
  AdsMetrics,
  DateRange,
  OperatingCost,
  Polarity,
  ProfitAndLoss,
  WooMetrics,
} from '../../lib/types'
import {
  blendedAds,
  cogsOf,
  combinedAds,
  grossProfitOf,
  grossSalesOf,
  netSalesOf,
  revenueOf,
  totalSalesOf,
} from '../../lib/pnl'
import { costLines, totalOperatingCost } from '../../lib/operatingCosts'
import { daysInRange } from '../../lib/dateRange'
import { deltaPct, round2 } from '../../lib/derive'
import {
  formatCurrency,
  formatDeltaPercent,
  formatDifference,
  formatPercent,
  formatRoas,
} from '../../lib/format'
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
  /**
   * Whether the statement is unfolded.
   *
   * Held by the section rather than here: the control that toggles it sits on
   * the section's title row, and two copies of the same boolean is how a
   * control and the thing it controls come to disagree.
   */
  statementOpen: boolean
  /** The id the section's toggle points `aria-controls` at. */
  statementId: string
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

/**
 * Ad spend's share of sales, as a line inside the spend box.
 *
 * A box of its own gave one ratio the same weight as the two sums it is struck
 * from, and spread four figures — the share, its relative move, the previous
 * share, the move in points — across a third of the row to say one thing. It
 * belongs to the spend: it is that figure expressed against sales, so it reads
 * under it, and only the two numbers worth carrying come with it.
 *
 * The movement is in points. This figure is already a percentage, and a
 * relative change beside it invites reading a fall from 56.0 to 44.3 as
 * twenty-one per cent of something rather than eleven and a half points.
 *
 * Null where there is nothing to divide by — a period with no revenue has no
 * ratio, and a zero denominator would state something untrue about the spend.
 */
function shareOfSales(
  spend: number | null,
  revenue: number | null,
  prevSpend: number | null | undefined,
  prevRevenue: number | null | undefined,
): string | undefined {
  if (spend === null || !revenue) return undefined

  const now = spend / revenue
  const share = `${formatPercent(now)} of sales`

  // Both halves of the comparison or neither: a previous spend against a
  // period whose revenue never loaded would print a movement that is an
  // artefact of the missing figure.
  if (prevSpend === null || prevSpend === undefined || !prevRevenue) return share

  const before = prevSpend / prevRevenue
  return `${share} · ${formatDifference((now - before) * 100, (n) => `${n.toFixed(1)}pp`)}`
}

/** One column of the strip under the headline. */
interface PerDayFigure {
  /** Stable across renders, so the open panel survives a refetch. */
  key: string
  label: string
  /** Pre-formatted, or an em dash where the figure did not report. */
  value: string
  change: number | null
  /**
   * The same figure over the comparison window, formatted. A percentage says a
   * direction and a size but not a scale, and these are the figures read first.
   */
  previous?: string
  /**
   * How far the figure moved, in its own units and signed.
   *
   * Sits under the percentage as the baseline sits under the figure, so each
   * column reads down: what it is and what it was, how far it moved in
   * proportion and how far in currency.
   */
  difference?: string
  polarity: Polarity
  /**
   * True for the amounts that are per day. The return on advertising is a
   * ratio, not a daily amount, so it carries no `/ day` in its label.
   */
  perDay?: boolean
  /**
   * What the figure is made of, shown when it is opened.
   *
   * A rate lists the total and the days it was divided by; a ratio lists the
   * two figures it was struck from; a sum lists the platforms it was summed
   * over. In every case the arithmetic on screen should be reproducible from
   * the panel without leaving the card.
   */
  detail: { label: string; value: string }[]
}

/** Everything a statement is built from, for either window. */
interface StatementInput {
  pnl: ProfitAndLoss
  adSpend: number | null
  operatingCost: number
}

/**
 * The statement in full, opening on revenue and breaking down from there.
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
  const cogs = cogsOf(pnl)
  const grossProfit = grossProfitOf(pnl)

  // The statement's base, so every share below answers "what part of what we
  // kept is this".
  //
  // Revenue leads and total sales sits inside the group it heads, the two
  // having swapped places. Money billed and money kept are different claims,
  // and the one the statement opens on is the one the rest of the page is
  // built from: gross profit is struck from revenue, and every heading below
  // descends from that. Opening on the wider figure meant the lead line was
  // the only one on the card nothing else was measured against.
  total('Revenue', revenue)
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
  // What was billed — the resting point between the money added on top and the
  // money handed back. Dropped when refunds are zero, on the same grounds as
  // net sales above: with nothing to deduct it is the revenue line again under
  // a second name.
  if (totalSales !== revenue) {
    subtotal('Total sales', totalSales)
  }
  // A refund is money handed over and returned, not a cost of trading, so it
  // comes off the sale rather than down among the overheads. It is deducted
  // here and nowhere else — every line above it is before refunds, and it is
  // the last movement on the way to the revenue this group heads.
  part('Refunds', refunds, '−', 'down-good', true)

  // The cost of the goods themselves: what was bought, what it cost to ship,
  // and what the processor took. Advertising and operations are costs of
  // running the store rather than of the goods, so they stay below the gross
  // profit line instead of inside this one.
  total('Cost of goods sold', cogs, 'down-good', true)
  part('Product cost', pnl.productCost, '−', 'down-good')
  part('Shipping cost', pnl.shippingCost, '−', 'down-good')
  part('Transaction cost', pnl.transactionCost, '−', 'down-good')
  // A heading in its own right, flush with revenue and cost of goods sold: the
  // statement's three landmarks, each with what produced it underneath.
  //
  // Struck from the revenue line rather than from the payload's own gross
  // profit, which is taken before refunds and against a sales figure this
  // statement no longer leads on. Two figures a few rows apart that do not
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

/** A line with the position it holds in the whole statement, not in its column. */
interface PlacedLine {
  line: Line
  index: number
}

/**
 * The statement in two columns for a wide screen, cut at a landmark.
 *
 * Cut at the `total` line nearest the middle rather than at the middle row.
 * The statement reads as headings with their parts beneath them — cost of
 * goods sold over the three costs it sums, gross profit over what comes off it
 * — and slicing at the halfway row would strand a heading at the foot of the
 * left column with its own contents at the head of the right one. Cutting on a
 * landmark means each column opens on a figure that introduces what follows it.
 *
 * The original index travels with each line because two things downstream are
 * measured against the statement as a whole rather than the column: the lead
 * row, which is only ever the first line of all, and the React key.
 */
function splitStatement(lines: Line[]): PlacedLine[][] {
  const placed: PlacedLine[] = lines.map((line, index) => ({ line, index }))

  // Short statements stay whole. A period with no coupons, shipping, tax or
  // refunds drops those rows, and splitting what is left would produce two
  // stubs with a rule between them rather than two columns.
  if (placed.length < 10) return [placed]

  const middle = placed.length / 2
  let cut = -1
  for (const { line, index } of placed) {
    // Never the opening line: cutting there leaves an empty left column.
    if (index === 0 || line.kind !== 'total') continue
    if (cut === -1 || Math.abs(index - middle) < Math.abs(cut - middle)) {
      cut = index
    }
  }

  // No landmark to cut on — one column, rather than an arbitrary break.
  if (cut === -1) return [placed]
  return [placed.slice(0, cut), placed.slice(cut)]
}

/* The statement's landmarks now live in `pnl.ts`, so the Targets section can
   measure a goal against the same net profit this card prints rather than
   deriving its own a second time. */

/**
 * The figure everything else is a share of: revenue, what the store kept over
 * the period.
 *
 * The kept figure rather than the billed one, so every share answers the
 * question the rest of the card is built on — "what part of what we kept is
 * this" — and gross profit, which is struck from this line, reads as a share
 * of the line it is struck from. Gross sales stands above it reading over
 * 100%, by the coupons and the refunds, which is the point of measuring
 * against a named total rather than against the widest line.
 */
const topLine = (pnl: ProfitAndLoss): { label: string; amount: number } => ({
  label: 'Revenue',
  amount: revenueOf(pnl),
})

export function ProfitSummaryCard({
  woo,
  reportedAds,
  costs,
  range,
  against,
  loading,
  failed,
  statementOpen,
  statementId,
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

  /**
   * The figure the change was struck against, printed beside it.
   *
   * A magnitude, matching `amount`: the sign a deduction carries lives in the
   * column to the left, and repeating it on the baseline would read as a
   * negative that had grown rather than a cost that had.
   */
  const previousOf = (line: Line): string | undefined => {
    const before = previousByLabel?.get(line.label)
    return before === undefined ? undefined : formatCurrency(Math.abs(before))
  }

  const anyPrevious = lines.some((line) => previousOf(line) !== undefined)

  const top = woo ? topLine(woo.pnl) : null
  const base = top?.amount ?? 0

  /**
   * The three figures a period total cannot answer on its own: whether a bigger
   * month was a better one or merely a longer one.
   *
   * Each window is divided by its own length. Under a comparison of unequal
   * spans — a part-month against the whole of the one before — a single divisor
   * would report a change in the daily rate that was only ever a change in the
   * number of days.
   */
  const perDay = useMemo((): PerDayFigure[] => {
    if (!top) return []
    const days = daysInRange(range)
    const daysBefore = against ? daysInRange(against) : null
    const netProfit = lines.find((line) => line.label === 'Net profit')?.amount ?? null
    const grossProfit = lines.find((line) => line.label === 'Gross profit')?.amount ?? null

    const rate = (amount: number) => amount / days
    const priorRate = (before: number | null | undefined): number | null =>
      before === null || before === undefined || daysBefore === null
        ? null
        : before / daysBefore

    const change = (amount: number, before: number | null | undefined): number | null => {
      const prior = priorRate(before)
      return prior === null ? null : deltaPct(rate(amount), prior)
    }
    /** The daily rate the change was struck against, for the column beside it. */
    const was = (before: number | null | undefined): string | undefined => {
      const prior = priorRate(before)
      return prior === null ? undefined : formatCurrency(prior)
    }
    /** How far the daily rate moved in currency, for the column under the change. */
    const gap = (amount: number, before: number | null | undefined): string | undefined => {
      const prior = priorRate(before)
      return prior === null
        ? undefined
        : formatDifference(rate(amount) - prior, formatCurrency)
    }
    const wasFlat = (
      before: number | null | undefined,
      format: (n: number) => string,
    ): string | undefined =>
      before === null || before === undefined ? undefined : format(before)
    /** The same, as a difference rather than a baseline. */
    const gapFlat = (
      now: number,
      before: number | null | undefined,
      format: (n: number) => string,
    ): string | undefined =>
      before === null || before === undefined
        ? undefined
        : formatDifference(now - before, format)

    // Taken from the payload rather than from the statement's own `Total sales`
    // row, which is dropped whenever refunds are zero — on a period with none,
    // a column read off the rows would vanish with it.
    const sales = woo ? totalSalesOf(woo.pnl) : null
    const salesBefore = woo?.pnlPrevious ? totalSalesOf(woo.pnlPrevious) : null

    /**
     * What the advertising returned, straight after the spend it returned on.
     *
     * Read through the same two functions the All ads card calls rather than
     * divided again here: these are the same claim on two cards, and a second
     * derivation is how two cards that agree today stop agreeing later.
     *
     * Both are shown because they answer different questions. Blended is the
     * store's own — total sales over everything spent, including platforms that
     * attribute nothing. Reported is what the platforms claim for themselves,
     * struck against the narrower base of those that answer for conversions at
     * all. The gap between the two is itself the reading.
     */
    const combined = reportedAds.length > 0 ? combinedAds(reportedAds) : null
    const attributed = !!combined && combined.reportsConversions !== false
    const priorReportedRoas =
      combined?.previousTotals && combined.previousTotals.spend > 0
        ? combined.previousTotals.conversionValue / combined.previousTotals.spend
        : null

    const rows: PerDayFigure[] = [
      {
        key: 'revenue',
        label: 'Revenue',
        value: formatCurrency(rate(top.amount)),
        change: change(top.amount, previousByLabel?.get('Revenue')),
        previous: was(previousByLabel?.get('Revenue')),
        difference: gap(top.amount, previousByLabel?.get('Revenue')),
        polarity: 'up-good',
        perDay: true,
        detail: [
          { label: 'Revenue over the period', value: formatCurrency(top.amount) },
          { label: 'Days in period', value: String(days) },
        ],
      },
      {
        // What was billed, where Revenue is what was kept: the two differ by
        // the refunds, and a day's takings before anything went back is the
        // figure the store's own sales reports are written in.
        key: 'sales',
        label: 'Sales',
        value: sales === null ? '—' : formatCurrency(rate(sales)),
        change: sales === null ? null : change(sales, salesBefore),
        previous: sales === null ? undefined : was(salesBefore),
        difference: sales === null ? undefined : gap(sales, salesBefore),
        polarity: 'up-good',
        perDay: true,
        detail:
          sales === null
            ? []
            : [
                { label: 'Total sales, billed', value: formatCurrency(sales) },
                { label: 'Less refunds', value: formatCurrency(sales - top.amount) },
                { label: 'Revenue, kept', value: formatCurrency(top.amount) },
                { label: 'Days in period', value: String(days) },
              ],
      },
      {
        key: 'net-profit',
        label: 'Net profit',
        value: netProfit === null ? '—' : formatCurrency(rate(netProfit)),
        change: netProfit === null ? null : change(netProfit, previousByLabel?.get('Net profit')),
        previous: netProfit === null ? undefined : was(previousByLabel?.get('Net profit')),
        difference:
          netProfit === null ? undefined : gap(netProfit, previousByLabel?.get('Net profit')),
        polarity: 'up-good',
        perDay: true,
        detail:
          netProfit === null
            ? []
            : [
                ...(grossProfit === null
                  ? []
                  : [{ label: 'Gross profit', value: formatCurrency(grossProfit) }]),
                {
                  label: 'Less advertising',
                  value: adSpend === null ? '—' : formatCurrency(adSpend),
                },
                { label: 'Net profit over the period', value: formatCurrency(netProfit) },
                { label: 'Days in period', value: String(days) },
              ],
      },
      {
        // Absent rather than zero when no platform reported: a store whose ads
        // connector failed did not advertise for nothing.
        key: 'ad-spend',
        label: 'Ad spend',
        value: adSpend === null ? '—' : formatCurrency(rate(adSpend)),
        change: adSpend === null ? null : change(adSpend, prevAdSpend),
        previous: adSpend === null ? undefined : was(prevAdSpend),
        difference: adSpend === null ? undefined : gap(adSpend, prevAdSpend),
        polarity: 'down-good',
        perDay: true,
        detail:
          adSpend === null
            ? []
            : [
                ...reportedAds.map((p) => ({
                  label: p.name,
                  value: `${formatCurrency(p.metrics.spend.value / days)} / day`,
                })),
                { label: 'Ad spend over the period', value: formatCurrency(adSpend) },
                { label: 'Days in period', value: String(days) },
              ],
      },
    ]

    const blended = woo && reportedAds.length > 0 ? blendedAds(woo, reportedAds) : null
    if (blended) {
      rows.push({
        key: 'blended-roas',
        label: 'Blended ROAS',
        value: formatRoas(blended.blendedRoas),
        change: blended.previous
          ? deltaPct(blended.blendedRoas, blended.previous.blendedRoas)
          : null,
        previous: wasFlat(blended.previous?.blendedRoas ?? null, formatRoas),
        difference: blended.previous
          ? formatDifference(
              blended.blendedRoas - blended.previous.blendedRoas,
              formatRoas,
            )
          : undefined,
        polarity: 'up-good',
        detail: [
          {
            label: 'Store sales',
            value: formatCurrency(blended.blendedRoas * blended.spend),
          },
          { label: 'Ad spend, every platform', value: formatCurrency(blended.spend) },
          { label: 'Cost per order', value: formatCurrency(blended.costPerOrder) },
        ],
      })
    }

    if (combined && attributed) {
      rows.push({
        key: 'reported-roas',
        label: 'Reported ROAS',
        value: formatRoas(combined.roas.value),
        change: combined.roas.deltaPct,
        previous: wasFlat(priorReportedRoas, formatRoas),
        difference: gapFlat(combined.roas.value, priorReportedRoas, formatRoas),
        polarity: 'up-good',
        detail: reportedAds.map((p) => ({
          label: p.name,
          value:
            p.metrics.reportsConversions === false
              ? 'reports no attribution'
              : formatRoas(p.metrics.roas.value),
        })),
      })
    }

    // Ad spend total is not here: it leads the card beside revenue.

    /**
     * The order the boxes read in, named rather than left to the order they
     * happened to be built in.
     *
     * The four daily rates first, down the statement itself — what was billed,
     * what was kept of it, what was left after everything, and what was spent
     * to produce it. Then the two returns that spend earned, the platforms'
     * own and the store's. Anything added later falls in behind them.
     */
    const ORDER = [
      'revenue',
      'sales',
      'net-profit',
      'ad-spend',
      'reported-roas',
      'blended-roas',
    ]
    return rows.sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key))
  }, [woo, top, lines, previousByLabel, adSpend, prevAdSpend, reportedAds, range, against])

  // Signed, so a deduction reads `−13.6%` beside its `−$448.18`. A share
  // printed bare made a line that comes off the total look like one that adds
  // to it, which is the one thing the figure beside it already says.
  const [openFigure, setOpenFigure] = useState<string | null>(null)

  const share = (line: Line): number => (base === 0 ? 0 : line.signed / base)
  const anyChange = lines.some((line) => changeOf(line) !== null)
  const openPanel = perDay.find((figure) => figure.key === openFigure)
  // The comparison window's revenue, formatted — the same figure the statement's
  // Revenue row is measured against, so the headline and the row below it can
  // never disagree about what the period is being compared with.
  /**
   * The two figures the card leads on: what the period earned, and what was
   * spent to earn it.
   *
   * Ad spend stands beside revenue rather than in the strip below because it is
   * the only figure on the card of the same order as revenue and read against
   * it — everything in the strip is a rate or a ratio derived from one of these
   * two.
   */
  const headline = useMemo(() => {
    const build = (
      label: string,
      amount: number | null,
      before: number | null | undefined,
      polarity: Polarity,
      /** A third line under the figure, where it is worth one. */
      note?: string,
    ) => {
      if (amount === null) return null
      const has = before !== null && before !== undefined
      return {
        label,
        value: formatCurrency(amount),
        change: has ? deltaPct(amount, before as number) : null,
        previous: has ? formatCurrency(before as number) : undefined,
        difference: has
          ? formatDifference(amount - (before as number), formatCurrency)
          : undefined,
        polarity,
        note,
      }
    }

    const revenue = top?.amount ?? null
    const prevRevenue = previousByLabel?.get('Revenue')

    return [
      build(top?.label ?? 'Revenue', revenue, prevRevenue, 'up-good'),
      build(
        'Ad spend total',
        adSpend,
        prevAdSpend,
        'down-good',
        shareOfSales(adSpend, revenue, prevAdSpend, prevRevenue),
      ),
    ].filter((figure): figure is NonNullable<typeof figure> => figure !== null)
  }, [top, previousByLabel, adSpend, prevAdSpend])


  return (
    // No card around it. The boxes inside are already bounded, and a panel
    // drawn around a grid of panels is a second frame saying nothing the first
    // did not — it only pushed every figure in by its own padding.
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Larger than the strip below but well short of the 30px it began
              at: they lead the card without making every figure under them read
              as a caption. Each carries the same four columns every box in the
              strip does — figure, change, baseline, move. */}
          <div className="mt-2">
            {loading ? (
              <div className="grid grid-cols-2 gap-2">
                <Skeleton className="h-[68px] w-full" />
                <Skeleton className="h-[68px] w-full" />
              </div>
            ) : failed || headline.length === 0 ? (
              <div className="rounded-lg border border-btn-border px-3 py-2.5 text-[24px] font-semibold leading-tight tabular-nums text-ink">
                —
              </div>
            ) : (
              /* Boxed and gridded like the strip below, at twice the type size:
                 the same grammar at the scale that says these lead the card.

                 Two to a line rather than three, because a figure in the
                 thousands needs the width. */
              <div className="grid grid-cols-2 gap-2">
                {headline.map((figure) => (
                  <div
                    key={figure.label}
                    className="min-w-0 rounded-lg border border-btn-border px-3 py-2.5"
                  >
                    {/* Named inside the box, both of them. The card's own title
                        names the card; a box that relied on it would be the one
                        figure here without a label of its own. */}
                    <div className="truncate text-[10.5px] uppercase tracking-wide text-label">
                      {figure.label}
                    </div>
                    <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
                      <span className="truncate text-[24px] font-semibold leading-tight tabular-nums text-ink">
                        {figure.value}
                      </span>
                      {figure.change !== null && (
                        <span
                          className={`flex items-center gap-0.5 text-[11px] tabular-nums ${changeColor(
                            figure.change,
                            figure.polarity,
                          )}`}
                        >
                          {figure.change < 0 ? (
                            <ArrowDown size={10} strokeWidth={3} />
                          ) : (
                            <ArrowUp size={10} strokeWidth={3} />
                          )}
                          {formatDeltaPercent(figure.change)}
                        </span>
                      )}
                    </div>
                    {/* The two comparison figures share the second line: what
                        it was, and how far it moved. They were on separate
                        lines only because the baseline sat in the row above
                        and wrapped out of it at this width — three lines of
                        figures under a label, where two say the same thing. */}
                    {(figure.previous !== undefined ||
                      figure.difference !== undefined) && (
                      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[11px] tabular-nums">
                        {figure.previous !== undefined && (
                          <span className="text-label">{figure.previous}</span>
                        )}
                        {figure.difference !== undefined && (
                          <span className={MOVE_INK}>{figure.difference}</span>
                        )}
                      </div>
                    )}
                    {/* Under the comparison: derived from both boxes rather
                        than a property of this one, so it sits below the
                        figures this box actually recorded. */}
                    {figure.note && (
                      <div className="mt-0.5 truncate text-[11px] tabular-nums text-label">
                        {figure.note}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Directly under the headline the period earned, because it is the same
          claim at a different scale — and above the statement, which breaks the
          period down rather than restating it. */}
      {!loading && !failed && perDay.length > 0 && (
        <div className="mt-3 border-t border-row-line pt-2.5">
          {/* A grid of boxes, three to a line, rather than figures flowing
              inline. Wrapped inline they packed differently at every width and
              read as a run-on table; boxed and gridded, each figure keeps its
              own bounds and the column edges line up down the card. */}
          <div className="grid grid-cols-3 gap-2">
            {perDay.map((figure) => (
              <StripFigure
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

          {openPanel && openPanel.detail.length > 0 && (
            <dl className="mt-2 flex flex-col rounded-lg border border-btn-border bg-btn px-3 py-2">
              {openPanel.detail.map((row) => (
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
        </div>
      )}

      {/* No control here. It sits on the section's title row, where there is a
          line to put it on — this card has no header of its own. */}
      <div id={statementId} hidden={!statementOpen} className="mt-4 border-t border-row-line pt-1">
      {loading ? (
        <div className="mt-2 flex flex-col gap-2">
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
        <div className="mt-1 overflow-x-auto">
          {/* One column until there is room for two. The statement is fifteen
              rows deep, which on a desktop left the card running far below the
              panel beside it and half the width empty; from `lg` it carries on
              into a second column instead of further down. */}
          // Flex rather than a grid: grid cells split the card in half whatever
          // the columns need, which on a wide screen left each statement
          // stranded at the left of its own half with a chasm between them.
          // Here the two size themselves and sit together.
          <div className="flex flex-col lg:flex-row lg:gap-x-12">
            {splitStatement(lines).map((column, columnIndex) => (
              <dl
                key={columnIndex}
                className={`flex w-full flex-col content-start ${
                  anyChange ? 'min-w-[20rem]' : 'min-w-[14.5rem]'
                } lg:flex-1 lg:max-w-[24rem] ${
                  // The rule only exists once the columns are side by side.
                  // Stacked, they are one continuous statement and a line
                  // across the middle would invent a break in it.
                  columnIndex > 0 ? 'lg:border-l lg:border-row-line lg:pl-12' : ''
                }`}
              >
                {column.map(({ line, index }) => (
                  <StatementRow
                    key={`${line.label}-${index}`}
                    line={line}
                    share={share(line)}
                    change={changeOf(line)}
                    previous={previousOf(line)}
                    showChange={anyChange}
                    showPrevious={anyPrevious}
                    // The line the statement opens on, and the one every share
                    // is measured against. It carries a little more weight than
                    // the headings below it for both reasons.
                    lead={index === 0}
                  />
                ))}
              </dl>
            ))}
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

/**
 * One figure of the strip, in a box that opens what it is made of.
 *
 * Two lines under the label: the figure with its percentage, then the two
 * figures that percentage is made from — what it was, and how far it moved.
 * Splitting those across two lines cost a third row of height in every column
 * of the grid to say nothing the pair does not say together.
 */
function StripFigure({
  figure,
  open,
  onToggle,
}: {
  figure: PerDayFigure
  open: boolean
  onToggle: () => void
}) {
  const openable = figure.detail.length > 0

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
      <div className="flex items-center gap-1 text-[10.5px] uppercase tracking-wide text-label">
        {figure.perDay ? `${figure.label} / day` : figure.label}
        {openable && (
          <ChevronDown
            size={10}
            className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        )}
      </div>
      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-[13.5px] font-semibold tabular-nums text-ink">
          {figure.value}
        </span>
        {figure.change !== null && (
          <span
            className={`flex items-center gap-0.5 text-[11px] tabular-nums ${changeColor(
              figure.change,
              figure.polarity,
            )}`}
          >
            {figure.change < 0 ? (
              <ArrowDown size={10} strokeWidth={3} />
            ) : (
              <ArrowUp size={10} strokeWidth={3} />
            )}
            {formatDeltaPercent(figure.change)}
          </span>
        )}
      </div>
      {/* Both comparison figures on the second line — what it was, then how
          far it moved. The baseline used to sit in the row above and wrap out
          of it in a box this narrow, which cost a third line to say the same
          thing. Two lines under the label, at every width. */}
      {(figure.previous !== undefined || figure.difference !== undefined) && (
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[11px] tabular-nums">
          {figure.previous !== undefined && (
            <span className="text-label">{figure.previous}</span>
          )}
          {figure.difference !== undefined && (
            <span className={MOVE_INK}>{figure.difference}</span>
          )}
        </div>
      )}
    </button>
  )
}

/**
 * The ink the move in currency is set in.
 *
 * Deeper than the baseline beside it, so the two are told apart at a glance
 * without the move competing with the percentage above it for attention. It is
 * the fourth number in the box and reads last by design.
 */
const MOVE_INK = 'text-[#5a5a62]'

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
  previous,
  showChange,
  showPrevious,
  lead = false,
}: {
  line: Line
  share: number
  change: number | null
  /** The comparison window's own figure, already formatted. */
  previous?: string
  showChange: boolean
  showPrevious: boolean
  /** The statement's opening line, set a size above the headings below it. */
  lead?: boolean
}) {
  const total = line.kind === 'total'
  // A subtotal stays indented with the movements it sums, but in the ink the
  // totals use — it is a figure to rest on, not another adjustment.
  const strong = total || line.kind === 'subtotal'
  const strongSize = lead ? 'text-[13.5px]' : 'text-[12px]'

  return (
    // Label left, figures right — but inside a row the column caps at ~23rem
    // rather than across the whole card.
    //
    // Pushing these to both edges of the card was tried and undone: a line's
    // figure ended up an inch or more from the label naming it, across a gap
    // that grew with every pixel of card width. The cap is what makes the
    // spread safe. It is a bound on that gap, so the row breathes on a wide
    // screen and the eye still crosses a short distance to read a label
    // against its number.
    <div
      className={`flex items-baseline justify-between gap-3 py-1 lg:gap-4 ${
        total ? 'border-t border-row-line first:border-0' : ''
      }`}
    >
      <dt
        title={line.label}
        className={`min-w-0 flex-1 truncate ${total ? '' : 'pl-2.5'} ${
          strong ? `${strongSize} font-medium text-ink` : 'text-[11px] text-muted'
        }`}
      >
        {line.label}
      </dt>
      {/* Two lines, as the shared rows are: figure and change above, the
          figure it moved from directly beneath. Out at the right behind a
          "vs" the pair sat at opposite ends of the line, which is a long way
          to travel for the one comparison the row exists to make. */}
      <dd className="flex shrink-0 flex-col">
        <div className="flex items-baseline gap-1.5">
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
        </div>
        {/* Rendered whenever any line carries a baseline, empty where this one
            does not: a line that appeared and vanished down the statement would
            give the rows ragged heights and break the scan. */}
        {showPrevious && (
          <span className="min-w-[4.75rem] text-right text-[10.5px] leading-tight tabular-nums text-label">
            {previous ?? ''}
          </span>
        )}
      </dd>
    </div>
  )
}
