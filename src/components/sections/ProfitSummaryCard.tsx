import { useMemo } from 'react'
import { TrendingUp } from 'lucide-react'
import type { AdsMetrics, DateRange, OperatingCost, WooMetrics } from '../../lib/types'
import { costLines, totalOperatingCost } from '../../lib/operatingCosts'
import { round2 } from '../../lib/derive'
import { formatCurrency, formatPercent } from '../../lib/format'
import { Skeleton } from '../Skeleton'

interface ProfitSummaryCardProps {
  woo: WooMetrics | undefined
  /** Platforms that actually reported; a failed one is left out, not zeroed. */
  reportedAds: { name: string; metrics: AdsMetrics }[]
  costs: OperatingCost[] | undefined
  range: DateRange
  loading: boolean
  failed: boolean
}

/** A heading figure, or one of the movements that produced it. */
interface Line {
  label: string
  /** The figure itself, always positive; the sign lives in `valueLabel`. */
  amount: number
  total: boolean
  /** Pre-formatted, carrying a sign only where the sign means something. */
  valueLabel: string
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
 * Every share is of the largest line — see `topLine`.
 */
function buildStatement(
  woo: WooMetrics,
  adSpend: number | null,
  operatingCost: number,
): Line[] {
  const { pnl } = woo
  const lines: Line[] = []

  const total = (label: string, amount: number): void => {
    lines.push({ label, amount, total: true, valueLabel: formatCurrency(amount) })
  }

  // Zero movements are dropped rather than listed flat — a store with no
  // refunds should not have to read a refund line to find that out.
  const part = (label: string, amount: number, sign: '+' | '−' | ''): void => {
    const value = round2(amount)
    if (value === 0) return
    lines.push({
      label,
      amount: value,
      total: false,
      valueLabel: `${sign}${formatCurrency(Math.abs(value))}`,
    })
  }

  total('Total revenue', pnl.totalRevenue)
  part('Gross sales', pnl.grossSales, '')
  part('Coupons', pnl.discounts, '−')
  part('Shipping charged', pnl.shippingCharged, '+')
  part('Tax collected', pnl.taxCollected, '+')

  total('Total cost', woo.totalCost.value)
  part('Product cost', pnl.productCost, '−')
  part('Shipping cost', pnl.shippingCost, '−')
  part('Transaction fees', pnl.transactionCost, '−')
  part('Other costs', pnl.otherCost, '−')

  total('Gross profit', pnl.grossProfit)
  part('Refunds', pnl.refunds, '−')
  // Absent rather than zero when no platform reported, so the line never
  // claims the store advertised for nothing.
  if (adSpend !== null) part('Ad spend', adSpend, '−')
  part('Operating costs', operatingCost, '−')

  total(
    'Net profit',
    round2(pnl.grossProfit - pnl.refunds - (adSpend ?? 0) - operatingCost),
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
const topLine = (woo: WooMetrics): { label: string; amount: number } =>
  woo.pnl.grossSales >= woo.pnl.totalRevenue
    ? { label: 'Gross sales', amount: woo.pnl.grossSales }
    : { label: 'Total revenue', amount: woo.pnl.totalRevenue }

export function ProfitSummaryCard({
  woo,
  reportedAds,
  costs,
  range,
  loading,
  failed,
}: ProfitSummaryCardProps) {
  const adSpend = reportedAds.length
    ? reportedAds.reduce((sum, p) => sum + p.metrics.spend.value, 0)
    : null

  const operatingCost = useMemo(
    () => totalOperatingCost(costLines(costs ?? [], range)),
    [costs, range],
  )

  const lines = useMemo(
    () => (woo ? buildStatement(woo, adSpend, operatingCost) : []),
    [woo, adSpend, operatingCost],
  )

  // The statement is headed by its own top line, not by its result — net
  // profit closes the list below, and stating it twice made the smallest
  // figure on the card the loudest thing on it.
  const top = woo ? topLine(woo) : null
  const base = top?.amount ?? 0
  const share = (amount: number): number => (base === 0 ? 0 : Math.abs(amount) / base)

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
        // On a narrow screen the label, figure and share cannot all fit; the
        // row scrolls sideways rather than wrapping a statement into
        // unreadable shapes or truncating the figures themselves.
        <div className="mt-4 overflow-x-auto border-t border-row-line pt-1">
          <dl className="flex min-w-[19rem] flex-col">
            {lines.map((line, index) => (
              <StatementRow
                key={`${line.label}-${index}`}
                line={line}
                share={share(line.amount)}
              />
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}

/**
 * Totals sit flush and carry a rule; the movements under them are indented and
 * muted, so the shape of the statement reads before any number does.
 */
function StatementRow({ line, share }: { line: Line; share: number }) {
  return (
    <div
      className={`flex items-baseline justify-between gap-2 py-1 ${
        line.total ? 'border-t border-row-line first:border-0' : ''
      }`}
    >
      <dt
        className={`truncate ${
          line.total ? 'text-[12px] font-medium text-ink' : 'pl-3 text-[11px] text-muted'
        }`}
      >
        {line.label}
      </dt>
      <dd className="flex shrink-0 items-baseline gap-2">
        <span
          className={`tabular-nums ${
            line.total ? 'text-[12px] font-semibold text-ink' : 'text-[11px] text-muted'
          }`}
        >
          {line.valueLabel}
        </span>
        {/* Fixed width so the shares line up as a column down the card. */}
        <span
          className={`w-12 text-right text-[11px] tabular-nums ${
            line.total ? 'text-[#9a9aa2]' : 'text-muted'
          }`}
        >
          {formatPercent(share)}
        </span>
      </dd>
    </div>
  )
}
