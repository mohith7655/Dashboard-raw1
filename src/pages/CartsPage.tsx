import { DollarSign, PackageX, Percent, RefreshCw } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { KpiGrid } from '../components/KpiGrid'
import { SourceBanner } from '../components/SourceBanner'
import { DataTable, type Column } from '../components/DataTable'
import { Pill, PILL_COLORS } from '../components/Pill'
import { useRange } from '../lib/rangeContext'
import { useCarts } from '../lib/resourceQueries'
import { useListState } from '../lib/useListState'
import { formatCurrency, formatDate, formatInteger, formatPercent } from '../lib/format'
import { formatRangeLabel } from '../lib/dateRange'
import type { CartRow, CartStatus } from '../lib/data/types'

const STATUS_COLOR: Record<CartStatus, string> = {
  active: PILL_COLORS.blue,
  abandoned: PILL_COLORS.amber,
  recovered: PILL_COLORS.green,
  placed: PILL_COLORS.grey,
}

const STATUS_LABEL: Record<CartStatus, string> = {
  active: 'Active',
  abandoned: 'Abandoned',
  recovered: 'Recovered',
  placed: 'Placed',
}

const columns: Column<CartRow>[] = [
  {
    key: 'customer',
    header: 'Customer',
    sortable: true,
    skeletonWidth: 'w-36',
    render: (r) => (
      <div className="min-w-0">
        <div className="truncate text-ink">{r.customer}</div>
        <div className="truncate text-[11px] text-muted">{r.email}</div>
      </div>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    skeletonWidth: 'w-24',
    render: (r) => <Pill color={STATUS_COLOR[r.status]}>{STATUS_LABEL[r.status]}</Pill>,
  },
  {
    key: 'createdAt',
    header: 'Created',
    sortable: true,
    skeletonWidth: 'w-24',
    render: (r) => <span className="tabular-nums text-muted">{formatDate(r.createdAt)}</span>,
  },
  {
    key: 'items',
    header: 'Items',
    align: 'right',
    sortable: true,
    skeletonWidth: 'w-6',
    render: (r) => <span className="tabular-nums text-ink">{formatInteger(r.items)}</span>,
  },
  {
    key: 'value',
    header: 'Value',
    align: 'right',
    sortable: true,
    skeletonWidth: 'w-20',
    render: (r) => <span className="tabular-nums text-ink">{formatCurrency(r.value)}</span>,
  },
]

export function CartsPage() {
  const { range } = useRange()
  const { query, setPage, toggleSort } = useListState('value', 25)
  const carts = useCarts(range, query)
  const data = carts.data

  return (
    <>
      <PageHeader
        title="Carts"
        subtitle={`Carts created between ${formatRangeLabel(range)}`}
      />

      <SourceBanner error={carts.error} onRetry={carts.refetch} retrying={carts.isFetching} />

      <div className="flex flex-col gap-6">
        <KpiGrid
          loading={carts.isLoading}
          failed={!!carts.error}
          items={[
            {
              label: 'Abandoned Carts',
              metric: data?.abandonedCarts,
              format: formatInteger,
              icon: PackageX,
              polarity: 'down-good',
            },
            {
              label: 'Abandoned Value',
              metric: data?.abandonedValue,
              format: formatCurrency,
              icon: DollarSign,
              polarity: 'down-good',
            },
            { label: 'Recovered Carts', metric: data?.recoveredCarts, format: formatInteger, icon: RefreshCw },
            { label: 'Recovery Rate', metric: data?.recoveryRate, format: formatPercent, icon: Percent },
          ]}
        />

        <DataTable
          title="All Carts"
          subtitle={`${formatInteger(data?.total ?? 0)} carts in selected period`}
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
          loading={carts.isLoading}
          fetching={carts.isFetching}
          unavailable={carts.error ? 'Carts unavailable' : undefined}
          noun="carts"
        />
      </div>
    </>
  )
}
