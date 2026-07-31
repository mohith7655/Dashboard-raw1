import { Repeat, TrendingUp, UserPlus, Users } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { KpiGrid } from '../components/KpiGrid'
import { SourceBanner } from '../components/SourceBanner'
import { DataTable, type Column } from '../components/DataTable'
import { Pill, PILL_COLORS } from '../components/Pill'
import { useRange } from '../lib/rangeContext'
import { useCustomers } from '../lib/resourceQueries'
import { useListState } from '../lib/useListState'
import { formatCurrency, formatDate, formatInteger, formatPercent } from '../lib/format'
import { formatRangeLabel } from '../lib/dateRange'
import type { CustomerRow, CustomerSegment } from '../lib/data/types'

const SEGMENT_COLOR: Record<CustomerSegment, string> = {
  new: PILL_COLORS.blue,
  returning: PILL_COLORS.green,
  vip: PILL_COLORS.violet,
  'at-risk': PILL_COLORS.amber,
}

const SEGMENT_LABEL: Record<CustomerSegment, string> = {
  new: 'New',
  returning: 'Returning',
  vip: 'VIP',
  'at-risk': 'At risk',
}

const columns: Column<CustomerRow>[] = [
  {
    key: 'name',
    header: 'Customer',
    sortable: true,
    skeletonWidth: 'w-36',
    render: (r) => (
      <div className="min-w-0">
        <div className="truncate text-ink">{r.name}</div>
        <div className="truncate text-[11px] text-muted">{r.email}</div>
      </div>
    ),
  },
  {
    key: 'segment',
    header: 'Segment',
    skeletonWidth: 'w-20',
    render: (r) => <Pill color={SEGMENT_COLOR[r.segment]}>{SEGMENT_LABEL[r.segment]}</Pill>,
  },
  {
    key: 'location',
    header: 'Location',
    skeletonWidth: 'w-24',
    render: (r) => (
      <span className="text-muted">
        {r.city}, {r.country}
      </span>
    ),
  },
  {
    key: 'orders',
    header: 'Orders',
    align: 'right',
    sortable: true,
    skeletonWidth: 'w-8',
    render: (r) => <span className="tabular-nums text-ink">{formatInteger(r.orders)}</span>,
  },
  {
    key: 'aov',
    header: 'AOV',
    align: 'right',
    sortable: true,
    skeletonWidth: 'w-16',
    render: (r) => <span className="tabular-nums text-muted">{formatCurrency(r.aov)}</span>,
  },
  {
    key: 'ltv',
    header: 'LTV',
    align: 'right',
    sortable: true,
    skeletonWidth: 'w-20',
    render: (r) => <span className="tabular-nums text-ink">{formatCurrency(r.ltv)}</span>,
  },
  {
    key: 'lastOrder',
    header: 'Last order',
    align: 'right',
    sortable: true,
    skeletonWidth: 'w-24',
    render: (r) => <span className="tabular-nums text-muted">{formatDate(r.lastOrder)}</span>,
  },
]

export function CustomersPage() {
  const { range } = useRange()
  const { query, setPage, toggleSort } = useListState('ltv', 25)
  const customers = useCustomers(range, query)
  const data = customers.data

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle={`Customers who ordered between ${formatRangeLabel(range)}`}
      />

      <SourceBanner
        error={customers.error}
        onRetry={customers.refetch}
        retrying={customers.isFetching}
      />

      <div className="flex flex-col gap-6">
        <KpiGrid
          loading={customers.isLoading}
          failed={!!customers.error}
          items={[
            { label: 'Total Customers', metric: data?.totalCustomers, format: formatInteger, icon: Users },
            { label: 'New Customers', metric: data?.newCustomers, format: formatInteger, icon: UserPlus },
            { label: 'Returning Rate', metric: data?.returningRate, format: formatPercent, icon: Repeat },
            { label: 'Avg Lifetime Value', metric: data?.avgLtv, format: formatCurrency, icon: TrendingUp },
          ]}
        />

        <DataTable
          title="All Customers"
          subtitle={`${formatInteger(data?.total ?? 0)} customers in selected period`}
          columns={columns}
          rows={data?.rows ?? []}
          rowKey={(r) => r.id}
          total={data?.total ?? 0}
          page={query.page}
          perPage={query.perPage}
          onPageChange={setPage}
          sort={query.sort}
          direction={query.direction}
          onSortChange={toggleSort}
          loading={customers.isLoading}
          fetching={customers.isFetching}
          unavailable={customers.error ? 'Customers unavailable' : undefined}
          noun="customers"
        />
      </div>
    </>
  )
}
