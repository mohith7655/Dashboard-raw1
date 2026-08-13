import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type {
  BreakdownGrain,
  RevenueBreakdownRow,
  RevenueBreakdownViewRow,
  SortDirection,
  TrafficPoint,
} from '../../lib/types'
import { BREAKDOWN_GRAINS } from '../../lib/types'
import {
  bucketLabel,
  bucketRows,
  bucketVisitors,
  totalRow,
  withTraffic,
} from '../../lib/revenueBreakdown'
import { formatCurrency, formatInteger, formatPercent } from '../../lib/format'
import { Skeleton } from '../Skeleton'

interface RevenueBreakdownCardProps {
  rows: RevenueBreakdownRow[]
  /** The analytics provider's daily visitors, folded onto the table's grain. */
  traffic: TrafficPoint[]
  /**
   * False when no analytics provider is connected. Distinct from an empty
   * series: the first means the conversion column cannot be known, the second
   * that it is known and nobody came.
   */
  trafficAvailable: boolean
  loading: boolean
  unavailable?: string
}

type SortField = keyof RevenueBreakdownViewRow

const GRAIN_LABELS: Record<BreakdownGrain, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
}

interface ColumnSpec {
  key: SortField
  header: string
  /** Deductions print in the accountant's parentheses and in red. */
  negative?: boolean
  /** Counts rather than money. */
  count?: boolean
  /** A ratio in 0..1, printed as a percentage. */
  rate?: boolean
  /** The line the table is really about, carried in the ink of a total. */
  lead?: boolean
  /** Closes the headline group, and takes a rule to mark where detail begins. */
  divide?: boolean
}

/**
 * The five figures a day is actually judged on, then the statement behind them.
 *
 * Traffic, orders, what was billed, what went back, and the rate that connects
 * the first two — read straight across from the date, before the reader
 * reaches a single line of the breakdown. The detail columns still follow, in
 * the order the statement itself reads, for the day a headline needs
 * explaining.
 */
const COLUMNS: ColumnSpec[] = [
  { key: 'visitors', header: 'Visitors', count: true },
  { key: 'orders', header: 'Orders', count: true },
  { key: 'totalSales', header: 'Total Sales', lead: true },
  { key: 'refunds', header: 'Refunds', negative: true },
  { key: 'conversion', header: 'Conversion', rate: true, divide: true },
  { key: 'grossSales', header: 'Gross Sales' },
  { key: 'discounts', header: 'Discounts', negative: true },
  { key: 'shippingCharged', header: 'Shipping' },
  { key: 'taxCollected', header: 'Tax' },
]

/** The rightmost column, which carries the card's padding. */
const LAST = COLUMNS[COLUMNS.length - 1].key

/**
 * The statement a row at a time.
 *
 * The CEO Dashboard says what the whole period earned; this says which day it
 * happened on. A month that looks flat in one figure is usually two good weeks
 * and two bad ones, and a refund column read down its length shows whether the
 * money went back steadily or all at once.
 *
 * Grouping sums the days rather than re-deriving the week, so a week's total is
 * exactly its days' totals and cannot drift from the rows behind it.
 */
export function RevenueBreakdownCard({
  rows,
  traffic,
  trafficAvailable,
  loading,
  unavailable,
}: RevenueBreakdownCardProps) {
  const [grain, setGrain] = useState<BreakdownGrain>('day')
  const [sort, setSort] = useState<SortField>('date')
  const [direction, setDirection] = useState<SortDirection>('asc')

  /*
   * Money folded first, then traffic folded onto the same buckets, then the
   * rate struck from the two. In that order because conversion cannot survive
   * the folding: a week's rate is its orders over its visitors, computed once,
   * and there is no way to reach that by combining the daily rates.
   */
  const grouped = useMemo(() => {
    const money = bucketRows(rows, grain)
    return withTraffic(money, bucketVisitors(traffic, grain), trafficAvailable)
  }, [rows, traffic, trafficAvailable, grain])

  const sorted = useMemo(() => {
    const copy = [...grouped]
    copy.sort((a, b) => {
      const left = a[sort]
      const right = b[sort]
      if (typeof left === 'string' && typeof right === 'string') {
        return direction === 'asc'
          ? left.localeCompare(right)
          : right.localeCompare(left)
      }
      // A column the provider never reported sorts to the bottom either way.
      // Coercing null to zero would file "unknown" among the worst days, which
      // is a claim the dash on screen is careful not to make.
      if (left === null && right === null) return 0
      if (left === null) return 1
      if (right === null) return -1
      const order = Number(left) - Number(right)
      return direction === 'asc' ? order : -order
    })
    return copy
  }, [grouped, sort, direction])

  // Off the ungrouped rows, so the figure under the table is the period's own
  // and never changes with the grain above it. The rate is struck from those
  // totals for the same reason it is struck per bucket above.
  const totals = useMemo((): RevenueBreakdownViewRow => {
    const money = totalRow(rows)
    const visitors = trafficAvailable
      ? traffic.reduce((sum, point) => sum + point.visitors, 0)
      : null
    return {
      ...money,
      visitors,
      conversion: visitors === null || visitors === 0 ? null : money.orders / visitors,
    }
  }, [rows, traffic, trafficAvailable])
  // The period's own bounds, so a partial week or month at either edge is
  // labelled with the days it holds rather than the days its calendar has.
  const firstDate = rows.length ? rows[0].date : ''
  const lastDate = rows.length ? rows[rows.length - 1].date : ''

  const onSort = (field: SortField) => {
    if (field === sort) {
      setDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSort(field)
    // Dates read forwards and figures read largest-first: the useful default
    // differs by what the column holds.
    setDirection(field === 'date' ? 'asc' : 'desc')
  }

  return (
    <div className="card p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-4 pt-5">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-ink">Revenue Breakdown</h3>
          <p className="mt-0.5 max-w-prose text-[12px] leading-relaxed text-muted">
            Paid orders only, in store currency — the same figures the statement
            above reports for the whole period. Refunds sit on the day the money
            went back, which may not be the period the order was placed in.
            Visitors come from the analytics provider rather than from the
            orders, and conversion is this row&apos;s orders over this row&apos;s
            visitors — so a week&apos;s rate is struck once from its own totals,
            not averaged from its days. A dash means the provider reported
            nothing for that bucket, which is not the same as nobody arriving.
          </p>
        </div>

        <label className="flex items-center gap-2">
          <span className="sr-only">Group by</span>
          <select
            value={grain}
            onChange={(event) => setGrain(event.target.value as BreakdownGrain)}
            className="h-8 rounded-md border border-btn-border bg-btn px-2 text-[13px] text-ink outline-none transition-colors focus:border-[#3d3d44]"
          >
            {BREAKDOWN_GRAINS.map((id) => (
              <option key={id} value={id}>
                {GRAIN_LABELS[id]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3 px-5 pb-5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      ) : unavailable ? (
        <p className="px-5 pb-6 text-[13px] text-muted">{unavailable}</p>
      ) : sorted.length === 0 ? (
        <p className="px-5 pb-6 text-[13px] text-muted">
          No orders in this period.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line text-left">
                <SortableTh
                  label={GRAIN_LABELS[grain] === 'Day' ? 'Date' : GRAIN_LABELS[grain]}
                  field="date"
                  sort={sort}
                  direction={direction}
                  onSort={onSort}
                  className="pl-5"
                />
                {COLUMNS.map((column) => (
                  <SortableTh
                    key={column.key}
                    label={column.header}
                    field={column.key}
                    sort={sort}
                    direction={direction}
                    onSort={onSort}
                    align="right"
                    className={`${column.divide ? 'border-r border-row-line' : ''} ${
                      column.key === LAST ? 'pr-5' : ''
                    }`}
                  />
                ))}
              </tr>
            </thead>

            <tbody>
              {sorted.map((row) => (
                <tr key={row.date} className="border-b border-row-line">
                  <td className="h-11 whitespace-nowrap pl-5 pr-3 align-middle text-muted">
                    {bucketLabel(row.date, grain, firstDate, lastDate)}
                  </td>
                  {COLUMNS.map((column) => (
                    <Cell key={column.key} column={column} row={row} />
                  ))}
                </tr>
              ))}
            </tbody>

            <tfoot>
              {/* The period's own totals, not the visible page's — there is no
                  paging here, but sorting a column must never look like it
                  changed what the period earned. */}
              <tr className="border-t border-line">
                <td className="h-12 pl-5 pr-3 align-middle text-[13px] font-semibold text-ink">
                  Totals
                </td>
                {COLUMNS.map((column) => (
                  <Cell key={column.key} column={column} row={totals} strong />
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

function Cell({
  column,
  row,
  strong = false,
}: {
  column: ColumnSpec
  row: RevenueBreakdownViewRow
  strong?: boolean
}) {
  const value = row[column.key]

  // Null is "the provider did not report", which is not zero and must not be
  // printed as one. The dash says so without taking a position on what the
  // figure would have been.
  if (value === null) {
    return (
      <td
        className={`h-11 px-3 text-right align-middle text-muted ${
          column.divide ? 'border-r border-row-line' : ''
        } ${column.key === LAST ? 'pr-5' : ''}`}
      >
        —
      </td>
    )
  }

  const amount = typeof value === 'number' ? value : 0

  // A deduction of nothing is not worth the red or the parentheses: a day with
  // no refunds should read as quiet, not as a zero someone has to check.
  const deducting = column.negative && amount > 0

  const text = column.rate
    ? formatPercent(amount)
    : column.count
      ? formatInteger(amount)
      : deducting
        ? `(${formatCurrency(amount)})`
        : formatCurrency(amount)

  const tone = deducting
    ? 'text-neg'
    : column.lead || column.count || column.rate || strong
      ? 'text-ink'
      : 'text-muted'

  return (
    <td
      className={`h-11 px-3 text-right align-middle tabular-nums ${tone} ${
        strong || column.lead ? 'font-semibold' : ''
      } ${column.divide ? 'border-r border-row-line' : ''} ${
        column.key === LAST ? 'pr-5' : ''
      }`}
    >
      {text}
    </td>
  )
}

function SortableTh({
  label,
  field,
  sort,
  direction,
  onSort,
  align = 'left',
  className = '',
}: {
  label: string
  field: SortField
  sort: SortField
  direction: SortDirection
  onSort: (field: SortField) => void
  align?: 'left' | 'right'
  className?: string
}) {
  const active = field === sort

  return (
    <th
      scope="col"
      className={`px-3 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-label ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        aria-label={`Sort by ${label}`}
        className={`inline-flex items-center gap-1 transition-colors hover:text-ink ${
          active ? 'text-ink' : ''
        } ${align === 'right' ? 'flex-row-reverse' : ''}`}
      >
        {label}
        {/* The inactive arrow is held at low opacity rather than hidden, so the
            header row does not reflow the moment a column is sorted. */}
        {active && direction === 'asc' ? (
          <ChevronUp size={12} />
        ) : active ? (
          <ChevronDown size={12} />
        ) : (
          <ChevronDown size={12} className="opacity-25" />
        )}
      </button>
    </th>
  )
}
