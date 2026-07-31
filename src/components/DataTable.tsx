import type { ReactNode } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react'
import type { SortDirection } from '../lib/types'
import { formatInteger } from '../lib/format'
import { Skeleton } from './Skeleton'

export interface Column<Row> {
  /** Stable key, also used as the sort field when `sortable` is set. */
  key: string
  header: string
  align?: 'left' | 'right'
  sortable?: boolean
  /** Fixed width utility class, e.g. `w-32`. */
  width?: string
  render: (row: Row) => ReactNode
  /** Placeholder width while loading, e.g. `w-24`. */
  skeletonWidth?: string
}

interface DataTableProps<Row> {
  title: string
  subtitle: string
  columns: Column<Row>[]
  rows: Row[]
  rowKey: (row: Row) => string
  /** Total across all pages, for the footer count. */
  total: number
  page: number
  perPage: number
  onPageChange: (page: number) => void
  sort?: string
  direction?: SortDirection
  onSortChange?: (key: string) => void
  loading?: boolean
  fetching?: boolean
  unavailable?: string
  /** Noun used in the footer, e.g. "orders". */
  noun?: string
  toolbar?: ReactNode
}

/**
 * The paginated, sortable table used by every list page. Pagination is always
 * driven by the caller, so it works the same against a server page or a
 * client-sliced fixture.
 */
export function DataTable<Row>({
  title,
  subtitle,
  columns,
  rows,
  rowKey,
  total,
  page,
  perPage,
  onPageChange,
  sort,
  direction = 'desc',
  onSortChange,
  loading,
  fetching,
  unavailable,
  noun = 'rows',
  toolbar,
}: DataTableProps<Row>) {
  const pageCount = Math.max(1, Math.ceil(total / perPage))
  const firstRow = total === 0 ? 0 : (page - 1) * perPage + 1
  const lastRow = Math.min(page * perPage, total)

  return (
    <div className="card p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-4 pt-5">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
          <p className="mt-0.5 text-[12px] text-muted">
            {loading ? 'Loading…' : subtitle}
          </p>
        </div>
        {toolbar && <div className="flex items-center gap-2">{toolbar}</div>}
      </div>

      {unavailable ? (
        <div className="px-5 pb-6 text-[13px] text-muted">{unavailable}</div>
      ) : (
        <>
          <div
            className={`overflow-x-auto transition-opacity ${
              fetching && !loading ? 'opacity-60' : ''
            }`}
          >
            <table className="w-full min-w-[760px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line text-left">
                  {columns.map((col, i) => (
                    <Th
                      key={col.key}
                      align={col.align}
                      className={`${i === 0 ? 'pl-5' : ''} ${
                        i === columns.length - 1 ? 'pr-5' : ''
                      } ${col.width ?? ''}`}
                      sortable={col.sortable && !!onSortChange}
                      active={sort === col.key}
                      direction={direction}
                      onClick={() => onSortChange?.(col.key)}
                    >
                      {col.header}
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: Math.min(perPage, 10) }, (_, i) => (
                      <tr key={i} className="border-b border-row-line last:border-0">
                        {columns.map((col, j) => (
                          <Td
                            key={col.key}
                            align={col.align}
                            className={`${j === 0 ? 'pl-5' : ''} ${
                              j === columns.length - 1 ? 'pr-5' : ''
                            }`}
                          >
                            <Skeleton
                              className={`h-3.5 ${col.skeletonWidth ?? 'w-24'} ${
                                col.align === 'right' ? 'ml-auto' : ''
                              }`}
                            />
                          </Td>
                        ))}
                      </tr>
                    ))
                  : rows.map((row) => (
                      <tr
                        key={rowKey(row)}
                        className="border-b border-row-line transition-colors last:border-0 hover:bg-[#1b1b1f]"
                      >
                        {columns.map((col, j) => (
                          <Td
                            key={col.key}
                            align={col.align}
                            className={`${j === 0 ? 'pl-5' : ''} ${
                              j === columns.length - 1 ? 'pr-5' : ''
                            }`}
                          >
                            {col.render(row)}
                          </Td>
                        ))}
                      </tr>
                    ))}

                {!loading && rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="px-5 py-10 text-center text-muted"
                    >
                      No {noun} in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-[12px] text-muted">
            <span className="tabular-nums">
              Showing {formatInteger(firstRow)}–{formatInteger(lastRow)} of{' '}
              {formatInteger(total)} {noun}
            </span>
            <div className="flex items-center gap-2">
              <PageButton
                label="Previous page"
                disabled={page <= 1 || loading}
                onClick={() => onPageChange(page - 1)}
              >
                <ChevronLeft size={14} />
              </PageButton>
              <span className="tabular-nums text-ink">
                {formatInteger(page)} / {formatInteger(pageCount)}
              </span>
              <PageButton
                label="Next page"
                disabled={page >= pageCount || loading}
                onClick={() => onPageChange(page + 1)}
              >
                <ChevronRight size={14} />
              </PageButton>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Th({
  children,
  align = 'left',
  className = '',
  sortable,
  active,
  direction,
  onClick,
}: {
  children: ReactNode
  align?: 'left' | 'right'
  className?: string
  sortable?: boolean
  active?: boolean
  direction?: SortDirection
  onClick?: () => void
}) {
  return (
    <th
      scope="col"
      aria-sort={
        sortable
          ? active
            ? direction === 'asc'
              ? 'ascending'
              : 'descending'
            : 'none'
          : undefined
      }
      className={`px-3 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-label ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${className}`}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onClick}
          className={`inline-flex items-center gap-1 transition-colors hover:text-ink ${
            align === 'right' ? 'flex-row-reverse' : ''
          } ${active ? 'text-ink' : ''}`}
        >
          {children}
          {active && direction === 'asc' ? (
            <ChevronUp size={12} />
          ) : (
            <ChevronDown size={12} className={active ? '' : 'opacity-40'} />
          )}
        </button>
      ) : (
        children
      )}
    </th>
  )
}

function Td({
  children,
  align = 'left',
  className = '',
}: {
  children: ReactNode
  align?: 'left' | 'right'
  className?: string
}) {
  return (
    <td
      className={`h-11 px-3 align-middle ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${className}`}
    >
      {children}
    </td>
  )
}

function PageButton({
  children,
  label,
  disabled,
  onClick,
}: {
  children: ReactNode
  label: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-lg border border-btn-border bg-btn text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  )
}

/** Client-side slice used by fixture-backed pages. */
export function paginateRows<Row>(
  rows: Row[],
  page: number,
  perPage: number,
): Row[] {
  const start = (page - 1) * perPage
  return rows.slice(start, start + perPage)
}
