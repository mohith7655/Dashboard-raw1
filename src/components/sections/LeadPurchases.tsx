import { useMemo, useState } from 'react'
import { ShoppingBag } from 'lucide-react'
import type { Column } from '../DataTable'
import { DataTable, paginateRows } from '../DataTable'
import { SectionLabel } from '../SectionLabel'
import { formatDay, formatInteger, formatPercent } from '../../lib/format'
import {
  LEAD_SOURCE_LABELS,
  LEAD_SOURCES,
  type LeadPurchaseContact,
  type LeadPurchaseReport,
  type LeadSourceKey,
} from '../../lib/types'

const PER_PAGE = 25
/** The campaign filter's value for Meta leads with no campaign on record. */
const NO_CAMPAIGN = '(none)'

interface Row extends LeadPurchaseContact {
  source: LeadSourceKey
}

type OrderFilter = 'all' | 'with' | 'none' | 'after' | 'before' | 'same'

const ORDER_FILTERS: { id: OrderFilter; label: string; test: (row: Row) => boolean }[] = [
  { id: 'all', label: 'All leads', test: () => true },
  { id: 'with', label: 'With Woo orders', test: (row) => row.orderCount > 0 },
  { id: 'none', label: 'No orders', test: (row) => row.orderCount === 0 },
  { id: 'after', label: 'Bought after lead', test: (row) => row.purchasedAfter },
  { id: 'before', label: 'Bought before lead', test: (row) => row.purchasedBefore },
  {
    id: 'same',
    label: 'Same-day order only',
    test: (row) => row.orderCount > 0 && !row.purchasedBefore && !row.purchasedAfter,
  },
]

const SELECT_CLASS =
  'h-8 max-w-[220px] rounded-md border border-btn-border bg-btn px-2 text-[13px] text-ink outline-none transition-colors focus:border-[#3d3d44]'

/**
 * Meta and Gravity Forms leads in the range, set against their Woo order
 * history. The campaign table above breaks Meta's figures down by campaign;
 * these are the totals for each source, and every lead behind them.
 */
export function LeadPurchases({ reports }: { reports: Record<LeadSourceKey, LeadPurchaseReport> }) {
  const [page, setPage] = useState(1)
  const [source, setSource] = useState<'all' | LeadSourceKey>('all')
  const [orders, setOrders] = useState<OrderFilter>('all')
  const [campaign, setCampaign] = useState('all')
  const [query, setQuery] = useState('')

  const allRows = useMemo<Row[]>(
    () => LEAD_SOURCES
      .flatMap((key) => reports[key].contacts.map((contact) => ({ ...contact, source: key })))
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt) || a.email.localeCompare(b.email)),
    [reports],
  )
  const campaigns = useMemo(() => {
    const names = new Set(allRows.filter((row) => row.source === 'facebook').map((row) => row.campaign ?? NO_CAMPAIGN))
    return [...names].sort((a, b) => (a === NO_CAMPAIGN ? 1 : b === NO_CAMPAIGN ? -1 : a.localeCompare(b)))
  }, [allRows])

  const rows = useMemo(() => {
    const test = ORDER_FILTERS.find((filter) => filter.id === orders)?.test ?? (() => true)
    const needle = query.trim().toLowerCase()
    return allRows.filter((row) =>
      (source === 'all' || row.source === source)
      && (campaign === 'all' || (row.source === 'facebook' && (row.campaign ?? NO_CAMPAIGN) === campaign))
      && test(row)
      && (!needle || row.email.includes(needle)),
    )
  }, [allRows, source, orders, campaign, query])

  const pageCount = Math.max(1, Math.ceil(rows.length / PER_PAGE))
  const currentPage = Math.min(page, pageCount)
  const visibleRows = useMemo(() => paginateRows(rows, currentPage, PER_PAGE), [rows, currentPage])
  // Any change of filter starts again from the first page.
  const filtered = <T,>(set: (value: T) => void) => (value: T) => {
    set(value)
    setPage(1)
  }

  const columns = useMemo<Column<Row>[]>(() => [
    {
      key: 'email',
      header: 'Email',
      width: 'min-w-[250px]',
      render: (row) => <span className="text-ink">{row.email}</span>,
    },
    {
      key: 'source',
      header: 'Lead source',
      render: (row) => <span className="text-muted">{LEAD_SOURCE_LABELS[row.source]}</span>,
    },
    {
      key: 'campaign',
      header: 'Campaign',
      width: 'min-w-[180px]',
      render: (row) => <span className="text-muted">{row.campaign ?? '—'}</span>,
    },
    {
      key: 'addedAt',
      header: 'Lead date',
      render: (row) => <span className="text-muted">{formatDay(row.addedAt)}</span>,
    },
    {
      key: 'purchaseHistory',
      header: 'WooCommerce history',
      render: (row) => {
        const label = row.orderCount === 0
          ? 'No orders'
          : row.purchasedBefore && row.purchasedAfter
            ? 'Bought before and after lead'
            : row.purchasedBefore
              ? 'Bought before lead'
              : row.purchasedAfter
                ? 'Bought after lead'
                : 'Same day as lead'
        const color = row.purchasedBefore || row.purchasedAfter
          ? 'text-pos'
          : row.orderCount === 0
            ? 'text-muted'
            : 'text-label'
        return <span className={color}>{label}</span>
      },
    },
    {
      key: 'orders',
      header: 'Orders',
      align: 'right',
      width: 'w-24',
      render: (row) => formatInteger(row.orderCount),
    },
    {
      key: 'firstOrderDate',
      header: 'First order',
      render: (row) => row.firstOrderDate ? formatDay(row.firstOrderDate) : '—',
    },
    {
      key: 'lastOrderDate',
      header: 'Last order',
      render: (row) => row.lastOrderDate ? formatDay(row.lastOrderDate) : '—',
    },
  ], [])

  const toolbar = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <label>
        <span className="sr-only">Lead source</span>
        <select
          value={source}
          onChange={(event) => filtered(setSource)(event.target.value as 'all' | LeadSourceKey)}
          className={SELECT_CLASS}
        >
          <option value="all">All sources</option>
          {LEAD_SOURCES.map((key) => <option key={key} value={key}>{LEAD_SOURCE_LABELS[key]}</option>)}
        </select>
      </label>
      <label>
        <span className="sr-only">Orders</span>
        <select
          value={orders}
          onChange={(event) => filtered(setOrders)(event.target.value as OrderFilter)}
          className={SELECT_CLASS}
        >
          {ORDER_FILTERS.map((filter) => <option key={filter.id} value={filter.id}>{filter.label}</option>)}
        </select>
      </label>
      {campaigns.length > 0 && (
        <label>
          <span className="sr-only">Meta campaign</span>
          <select
            value={campaign}
            onChange={(event) => filtered(setCampaign)(event.target.value)}
            className={SELECT_CLASS}
          >
            <option value="all">All campaigns</option>
            {campaigns.map((name) => (
              <option key={name} value={name}>{name === NO_CAMPAIGN ? 'No campaign on record' : name}</option>
            ))}
          </select>
        </label>
      )}
      <label>
        <span className="sr-only">Search email</span>
        <input
          type="search"
          value={query}
          onChange={(event) => filtered(setQuery)(event.target.value)}
          placeholder="Search email"
          className={`${SELECT_CLASS} w-40`}
        />
      </label>
    </div>
  )

  return (
    <section className="flex flex-col gap-4">
      <SectionLabel glyph={<ShoppingBag size={14} className="text-muted" />}>Leads with Woo orders</SectionLabel>

      {LEAD_SOURCES.map((key) => {
        const report = reports[key]
        return (
          <div key={key} className="flex flex-col gap-2">
            <div className="px-1 text-[11px] font-medium uppercase tracking-wide text-label">
              {LEAD_SOURCE_LABELS[key]}
            </div>
            {/* The lead count itself is the headline card above, so it is not repeated here. */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
              <Metric label="With Woo orders" value={report.total - report.noPurchase} note="Any WooCommerce order on record" />
              <Metric label="Previously purchased" value={report.previouslyPurchased} note="First Woo order was before the lead date" />
              <Metric label="Purchased after lead" value={report.purchasedAfter} note="Woo order dated after the lead date" />
              <Metric label="Same-day order" value={report.sameDayOrUnknown} note="Only ordered on the lead day itself" />
              <Metric
                label="Conversion rate"
                value={formatPercent(report.conversionRate)}
                note="Purchased after lead ÷ all leads"
              />
            </div>
          </div>
        )
      })}

      <DataTable
        title="Leads and their Woo orders"
        subtitle="Every Meta and Gravity Forms lead from the selected dates, dated by each email's first lead day in the range."
        columns={columns}
        rows={visibleRows}
        rowKey={(row) => `${row.source}:${row.email}`}
        total={rows.length}
        page={currentPage}
        perPage={PER_PAGE}
        onPageChange={setPage}
        noun="leads"
        toolbar={toolbar}
        unavailable={
          allRows.length === 0
            ? 'No leads in this period.'
            : rows.length === 0
              ? 'No leads match these filters.'
              : undefined
        }
      />
      <p className="px-1 text-[11px] leading-relaxed text-muted">
        Order dates are whole days, so an order on the lead day itself cannot be placed before or after it. Someone who bought both before and after counts in both columns.
      </p>
    </section>
  )
}

function Metric({ label, value, note }: { label: string; value: number | string; note: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-btn-border px-3 py-2.5">
      <div className="truncate text-[10.5px] uppercase tracking-wide text-label">{label}</div>
      <div className="mt-1 truncate text-[24px] font-semibold leading-tight tabular-nums text-ink">
        {typeof value === 'number' ? formatInteger(value) : value}
      </div>
      <div className="mt-0.5 text-[11px] text-label">{note}</div>
    </div>
  )
}
