import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Loader2 } from 'lucide-react'
import type {
  CustomerOrders,
  CustomerSummary,
  Order,
  OrderSortField,
  OrdersPage,
  SortDirection,
} from '../lib/types'
import { STATUS_COLORS, STATUS_LABELS } from '../lib/statusColors'
import { countryName } from '../lib/countries'
import { formatCurrency, formatDate, formatInteger, formatMoneyIn } from '../lib/format'
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
  /**
   * Failed orders across the whole period, not merely the page on screen.
   * Null where the metric set that counts them has not loaded, which is not
   * the same as none having failed.
   */
  failedOrders?: number | null
  /**
   * The buyer history opened from a row, and the setter that opens it. Held by
   * the page rather than the row so only one is ever fetched at a time.
   */
  openEmail?: string | null
  onOpenEmail?: (email: string | null) => void
  history?: CustomerOrders | undefined
  historyLoading?: boolean
  historyError?: string | null
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
  failedOrders = null,
  openEmail = null,
  onOpenEmail,
  history,
  historyLoading = false,
  historyError = null,
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
          {loading && !page ? (
            'Loading orders…'
          ) : (
            <>
              {formatInteger(total)} orders in selected period
              {/* Stated even at zero: a count that vanishes when nothing failed
                  cannot be told apart from one that never loaded, and "none
                  failed" is the reassurance being looked for. */}
              {failedOrders !== null && (
                <>
                  {' · '}
                  <span className={failedOrders > 0 ? 'text-neg' : undefined}>
                    {formatInteger(failedOrders)} failed
                  </span>
                </>
              )}
            </>
          )}
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
            <table className="w-full min-w-[880px] border-collapse text-[13px]">
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
                  <Th>Country</Th>
                  <Th>Paid</Th>
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
                  : page.orders.map((order) => {
                      const email = order.email.trim().toLowerCase()
                      const open = !!email && openEmail === email
                      return (
                        <Row
                          key={order.id}
                          order={order}
                          summary={email ? page.customers?.[email] : undefined}
                          open={open}
                          onToggle={
                            onOpenEmail
                              ? () => onOpenEmail(open ? null : email)
                              : undefined
                          }
                          history={open ? history : undefined}
                          historyLoading={open && historyLoading}
                          historyError={open ? historyError : null}
                        />
                      )
                    })}

                {page && !loading && page.orders.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-8 text-center text-muted">
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

function Row({
  order,
  summary,
  open,
  onToggle,
  history,
  historyLoading,
  historyError,
}: {
  order: Order
  summary: CustomerSummary | undefined
  open: boolean
  onToggle: (() => void) | undefined
  history: CustomerOrders | undefined
  historyLoading: boolean
  historyError: string | null
}) {
  return (
    <>
    <tr className="border-b border-row-line transition-colors last:border-0 hover:bg-[#1b1b1f]">
      <Td className="pl-5">
        <span className="font-mono text-ink">#{order.number}</span>
      </Td>
      <Td className="text-muted">{formatDate(order.date)}</Td>
      <Td>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-ink">{order.customer}</span>
            <CustomerBadge
              summary={summary}
              open={open}
              onToggle={onToggle}
              loading={historyLoading}
            />
          </div>
          {/* The city stays here where there is no email to show instead; the
              country has a column of its own now and would only repeat. */}
          {(order.email || order.city) && (
            <div className="truncate text-[11px] text-muted">
              {order.email || order.city}
            </div>
          )}
        </div>
      </Td>
      <Td className="text-muted">
        {order.country ? (
          <span title={countryName(order.country)}>{order.country}</span>
        ) : (
          '—'
        )}
      </Td>
      <Td className="tabular-nums text-muted">
        {/* What was actually charged, in the currency it was charged in. The
            total beside it is the same money converted to store currency, so
            the two figures differ on every foreign order by design. */}
        {order.currency ? (
          <span title={`Charged in ${order.currency}; the total is the same order in store currency`}>
            {order.paid > 0 ? formatMoneyIn(order.paid, order.currency) : order.currency}
          </span>
        ) : (
          '—'
        )}
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

    {open && (
      <tr className="border-b border-row-line bg-[#141417] last:border-0">
        <td colSpan={8} className="px-5 py-3">
          <CustomerHistory
            currentOrderId={order.id}
            summary={summary}
            history={history}
            loading={historyLoading}
            error={historyError}
          />
        </td>
      </tr>
    )}
    </>
  )
}

/**
 * Whether this name has bought before, and how much of it there is.
 *
 * The count is the control that opens the history, so the figure the reader
 * wants to interrogate is the thing they click — there is no separate affordance
 * to find. A first-time buyer has nothing to open and gets a plain label.
 */
function CustomerBadge({
  summary,
  open,
  onToggle,
  loading,
}: {
  summary: CustomerSummary | undefined
  open: boolean
  onToggle: (() => void) | undefined
  loading: boolean
}) {
  // Undefined where the lookup failed or the order carries no email. Silent
  // rather than guessing: a guest checkout is not evidence of a first order.
  if (!summary) return null

  if (summary.orderCount <= 1) {
    return (
      <span className="shrink-0 rounded-full border border-[#4ade8033] bg-[#4ade801f] px-1.5 py-px text-[10px] font-medium text-pos">
        New
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!onToggle}
      aria-expanded={open}
      title={`${summary.orderCount} orders, ${summary.itemCount} items, ${formatCurrency(
        summary.totalSpent,
      )} lifetime`}
      className="flex shrink-0 items-center gap-1 rounded-full border border-btn-border bg-btn px-1.5 py-px text-[10px] font-medium text-muted transition-colors hover:border-[#3a3a40] hover:text-ink disabled:cursor-default"
    >
      {loading ? (
        <Loader2 size={9} className="animate-spin" />
      ) : (
        <ChevronDown size={9} className={open ? 'rotate-180' : ''} />
      )}
      {summary.orderCount} orders · {summary.itemCount} items
    </button>
  )
}

/** The other orders behind the count, newest first. */
function CustomerHistory({
  currentOrderId,
  summary,
  history,
  loading,
  error,
}: {
  currentOrderId: string
  summary: CustomerSummary | undefined
  history: CustomerOrders | undefined
  loading: boolean
  error: string | null
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-64" />
        <Skeleton className="h-3 w-80" />
      </div>
    )
  }

  if (error) return <p className="text-[12px] text-neg">{error}</p>

  const orders = history?.orders ?? []
  if (orders.length === 0) {
    return <p className="text-[12px] text-muted">No other orders found for this customer.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      {summary && (
        <p className="text-[11px] text-label">
          {formatInteger(summary.orderCount)} orders ·{' '}
          {formatInteger(summary.itemCount)} items ·{' '}
          {formatCurrency(summary.totalSpent)} lifetime
          {summary.firstOrderDate &&
            ` · first ordered ${formatDate(summary.firstOrderDate)}`}
        </p>
      )}

      <div className="flex flex-col">
        {orders.map((entry) => {
          // The row this was opened from is kept in the list rather than
          // filtered out: a history with a gap where the current order should
          // be reads as a history that is missing something.
          const isCurrent = entry.id === currentOrderId
          return (
            <div
              key={entry.id}
              className={`flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-row-line py-1.5 last:border-0 ${
                isCurrent ? 'text-ink' : 'text-muted'
              }`}
            >
              <span className="w-[5.5rem] shrink-0 font-mono text-[11px]">
                #{entry.number}
              </span>
              <span className="w-[6rem] shrink-0 text-[11px] tabular-nums">
                {formatDate(entry.date)}
              </span>
              <span className="w-[5rem] shrink-0 text-[11px]">
                {STATUS_LABELS[entry.status]}
              </span>
              <span className="w-[4.5rem] shrink-0 text-right text-[11px] tabular-nums">
                {formatCurrency(entry.total)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px]">
                {entry.lines
                  .map((line) => `${line.name}${line.quantity > 1 ? ` ×${line.quantity}` : ''}`)
                  .join(', ')}
              </span>
              {isCurrent && (
                <span className="shrink-0 text-[10px] text-label">this order</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
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
        <Skeleton className="h-3.5 w-8" />
      </Td>
      <Td>
        <Skeleton className="h-3.5 w-10" />
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
