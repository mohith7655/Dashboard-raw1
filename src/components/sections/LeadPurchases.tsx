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

interface Row extends LeadPurchaseContact {
  source: LeadSourceKey
}

/**
 * Meta and Gravity Forms leads in the range, set against their Woo order
 * history. The campaign table above breaks Meta's figures down by campaign;
 * these are the totals for each source.
 */
export function LeadPurchases({ reports }: { reports: Record<LeadSourceKey, LeadPurchaseReport> }) {
  const [page, setPage] = useState(1)
  const rows = useMemo<Row[]>(
    () => LEAD_SOURCES
      .flatMap((source) => reports[source].contacts.map((contact) => ({ ...contact, source })))
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt) || a.email.localeCompare(b.email)),
    [reports],
  )
  const pageCount = Math.max(1, Math.ceil(rows.length / PER_PAGE))
  const currentPage = Math.min(page, pageCount)
  const visibleRows = useMemo(() => paginateRows(rows, currentPage, PER_PAGE), [rows, currentPage])

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
      key: 'addedAt',
      header: 'Lead date',
      render: (row) => <span className="text-muted">{formatDay(row.addedAt)}</span>,
    },
    {
      key: 'purchaseHistory',
      header: 'WooCommerce history',
      render: (row) => {
        const label = row.purchasedBefore && row.purchasedAfter
          ? 'Bought before and after lead'
          : row.purchasedBefore
            ? 'Bought before lead'
            : row.purchasedAfter
              ? 'Bought after lead'
              : 'Same day as lead'
        return <span className={row.purchasedBefore || row.purchasedAfter ? 'text-pos' : 'text-label'}>{label}</span>
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

  return (
    <section className="flex flex-col gap-4">
      <SectionLabel glyph={<ShoppingBag size={14} className="text-muted" />}>Leads with Woo orders</SectionLabel>

      {LEAD_SOURCES.map((source) => {
        const report = reports[source]
        return (
          <div key={source} className="flex flex-col gap-2">
            <div className="px-1 text-[11px] font-medium uppercase tracking-wide text-label">
              {LEAD_SOURCE_LABELS[source]}
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
        title="Leads with Woo orders"
        subtitle="Meta and Gravity Forms leads from the selected dates with a WooCommerce order, dated by each email's first lead day in the range."
        columns={columns}
        rows={visibleRows}
        rowKey={(row) => `${row.source}:${row.email}`}
        total={rows.length}
        page={currentPage}
        perPage={PER_PAGE}
        onPageChange={setPage}
        noun="contacts"
        unavailable={rows.length === 0 ? 'No lead in this period has a Woo order.' : undefined}
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
