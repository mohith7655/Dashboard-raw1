import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react'
import type {
  Order,
  OrderSortField,
  OrdersPage,
  SortDirection,
} from '../lib/types'
import { STATUS_COLORS, STATUS_LABELS } from '../lib/statusColors'
import { formatCurrency, formatDate, formatInteger } from '../lib/format'
import { Skeleton } from './Skeleton'

interface RecentOrdersProps {
  page: OrdersPage | null
  sort: OrderSortField
  direction: SortDirection
  onSortChange: (field: OrderSortField) => void
  onPageChange: (page: number) => void
  /** No data yet — render skeleton rows. */
  loading?: boolean
  /** Refetching with a page already on screen — dim it instead of blanking it. */
  fetching?: boolean
  unavailable?: string
}

export function RecentOrders({
  page,
  sort,
  direction,
  onSortChange,
  onPageChange,
  loading,
  fetching,
  unavailable,
}: RecentOrdersProps) {
  const total = page?.total ?? 0
  const perPage = page?.perPage ?? 10
  const current = page?.page ?? 1
  const pageCount = Math.max(1, Math.ceil(total / perPage))
  const firstRow = total === 0 ? 0 : (current - 1) * perPage + 1
  const lastRow = Math.min(current * perPage, total)

  return (
    <div className="card p-0">
      <div className="px-5 pb-4 pt-5">
        <h3 className="text-[15px] font-semibold text-ink">Recent Orders</h3>
        <p className="mt-0.5 text-[12px] text-muted">
          {loading && !page
            ? 'Loading orders…'
            : `${formatInteger(total)} orders in selected period`}
        </p>
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
            <table className="w-full min-w-[720px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line text-left">
                  <Th className="pl-5">Order</Th>
                  <Th
                    sortable
                    active={sort === 'date'}
                    direction={direction}
                    onClick={() => onSortChange('date')}
                  >
                    Date
                  </Th>
                  <Th>Customer</Th>
                  <Th>Status</Th>
                  <Th align="right">Items</Th>
                  <Th
                    align="right"
                    className="pr-5"
                    sortable
                    active={sort === 'total'}
                    direction={direction}
                    onClick={() => onSortChange('total')}
                  >
                    Total
                  </Th>
                </tr>
              </thead>
              <tbody>
                {loading || !page
                  ? Array.from({ length: perPage }, (_, i) => <SkeletonRow key={i} />)
                  : page.orders.map((order) => <Row key={order.id} order={order} />)}

                {page && !loading && page.orders.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-muted">
                      No orders in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-[12px] text-muted">
            <span className="tabular-nums">
              Showing {formatInteger(firstRow)}–{formatInteger(lastRow)} of{' '}
              {formatInteger(total)} orders
            </span>
            <div className="flex items-center gap-2">
              <PageButton
                label="Previous page"
                disabled={current <= 1 || loading}
                onClick={() => onPageChange(current - 1)}
              >
                <ChevronLeft size={14} />
              </PageButton>
              <span className="tabular-nums text-ink">
                {formatInteger(current)} / {formatInteger(pageCount)}
              </span>
              <PageButton
                label="Next page"
                disabled={current >= pageCount || loading}
                onClick={() => onPageChange(current + 1)}
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

function Row({ order }: { order: Order }) {
  return (
    <tr className="border-b border-row-line transition-colors last:border-0 hover:bg-[#1b1b1f]">
      <Td className="pl-5">
        <span className="font-mono text-ink">#{order.number}</span>
      </Td>
      <Td className="text-muted">{formatDate(order.date)}</Td>
      <Td>
        <div className="min-w-0">
          <div className="truncate text-ink">{order.customer}</div>
          {(order.email || order.city) && (
            <div className="truncate text-[11px] text-muted">
              {order.email || [order.city, order.country].filter(Boolean).join(', ')}
            </div>
          )}
        </div>
      </Td>
      <Td>
        <StatusPill status={order.status} />
      </Td>
      <Td align="right" className="tabular-nums text-ink">
        {formatInteger(order.items)}
      </Td>
      <Td align="right" className="pr-5 tabular-nums text-ink">
        {formatCurrency(order.total)}
      </Td>
    </tr>
  )
}

function StatusPill({ status }: { status: Order['status'] }) {
  const color = STATUS_COLORS[status]
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ color, background: `${color}1f`, border: `1px solid ${color}33` }}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}

function SkeletonRow() {
  return (
    <tr className="border-b border-row-line last:border-0">
      <Td className="pl-5">
        <Skeleton className="h-3.5 w-16" />
      </Td>
      <Td>
        <Skeleton className="h-3.5 w-24" />
      </Td>
      <Td>
        <Skeleton className="h-3.5 w-32" />
      </Td>
      <Td>
        <Skeleton className="h-5 w-20 rounded-full" />
      </Td>
      <Td align="right">
        <Skeleton className="ml-auto h-3.5 w-6" />
      </Td>
      <Td align="right" className="pr-5">
        <Skeleton className="ml-auto h-3.5 w-16" />
      </Td>
    </tr>
  )
}

interface ThProps {
  children: React.ReactNode
  align?: 'left' | 'right'
  className?: string
  sortable?: boolean
  active?: boolean
  direction?: SortDirection
  onClick?: () => void
}

function Th({
  children,
  align = 'left',
  className = '',
  sortable,
  active,
  direction,
  onClick,
}: ThProps) {
  const alignment = align === 'right' ? 'text-right' : 'text-left'
  return (
    <th
      scope="col"
      aria-sort={
        sortable ? (active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none') : undefined
      }
      className={`px-3 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-label ${alignment} ${className}`}
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
  children: React.ReactNode
  align?: 'left' | 'right'
  className?: string
}) {
  const alignment = align === 'right' ? 'text-right' : 'text-left'
  return (
    <td className={`h-11 px-3 align-middle ${alignment} ${className}`}>{children}</td>
  )
}

function PageButton({
  children,
  label,
  disabled,
  onClick,
}: {
  children: React.ReactNode
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
