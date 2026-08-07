import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type {
  BreakdownGrain,
  RevenueBreakdownRow,
  SortDirection,
} from '../../lib/types'
import { BREAKDOWN_GRAINS } from '../../lib/types'
import { bucketLabel, bucketRows, totalRow } from '../../lib/revenueBreakdown'
import { formatCurrency, formatInteger } from '../../lib/format'
import { Skeleton } from '../Skeleton'

interface RevenueBreakdownCardProps {
  rows: RevenueBreakdownRow[]
  loading: boolean
  unavailable?: string
}

type SortField = keyof RevenueBreakdownRow

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
  /** The line the table is really about, carried in the ink of a total. */
  lead?: boolean
}

const COLUMNS: ColumnSpec[] = [
  { key: 'orders', header: 'Orders', count: true },
  { key: 'grossSales', header: 'Gross Sales' },
  { key: 'discounts', header: 'Discounts', negative: true },
  { key: 'refunds', header: 'Refunds', negative: true },
  { key: 'shippingCharged', header: 'Shipping' },
  { key: 'taxCollected', header: 'Tax' },
  { key: 'totalSales', header: 'Total Sales', lead: true },
]

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
  loading,
  unavailable,
}: RevenueBreakdownCardProps) {
  const [grain, setGrain] = useState<BreakdownGrain>('day')
  const [sort, setSort] = useState<SortField>('date')
  const [direction, setDirection] = useState<SortDirection>('asc')

  const grouped = useMemo(() => bucketRows(rows, grain), [rows, grain])

  const sorted = useMemo(() => {
    const copy = [...grouped]
    copy.sort((a, b) => {
      const left = a[sort]
      const right = b[sort]
      const order =
        typeof left === 'string' && typeof right === 'string'
          ? left.localeCompare(right)
          : Number(left) - Number(right)
      return direction === 'asc' ? order : -order
    })
    return copy
  }, [grouped, sort, direction])

  // Off the ungrouped rows, so the figure under the table is the period's own
  // and never changes with the grain above it.
  const totals = useMemo(() => totalRow(rows), [rows])
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
          <table className="w-full min-w-[720px] border-collapse text-[13px]">
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
                    className={column.key === 'totalSales' ? 'pr-5' : ''}
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
  row: RevenueBreakdownRow
  strong?: boolean
}) {
  const value = row[column.key]
  const amount = typeof value === 'number' ? value : 0

  // A deduction of nothing is not worth the red or the parentheses: a day with
  // no refunds should read as quiet, not as a zero someone has to check.
  const deducting = column.negative && amount > 0

  const text = column.count
    ? formatInteger(amount)
    : deducting
      ? `(${formatCurrency(amount)})`
      : formatCurrency(amount)

  const tone = deducting
    ? 'text-neg'
    : column.lead || column.count || strong
      ? 'text-ink'
      : 'text-muted'

  return (
    <td
      className={`h-11 px-3 text-right align-middle tabular-nums ${tone} ${
        strong || column.lead ? 'font-semibold' : ''
      } ${column.key === 'totalSales' ? 'pr-5' : ''}`}
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
