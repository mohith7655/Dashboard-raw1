import { DollarSign, Package, RotateCcw, Tag } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { KpiGrid } from '../components/KpiGrid'
import { SourceBanner } from '../components/SourceBanner'
import { DataTable, type Column } from '../components/DataTable'
import { Pill, PILL_COLORS } from '../components/Pill'
import { useRange } from '../lib/rangeContext'
import { useProducts } from '../lib/resourceQueries'
import { useListState } from '../lib/useListState'
import { formatCurrency, formatInteger, formatPercent } from '../lib/format'
import { formatRangeLabel } from '../lib/dateRange'
import type { ProductRow, ProductStockStatus } from '../lib/data/types'

const STOCK_COLOR: Record<ProductStockStatus, string> = {
  'in-stock': PILL_COLORS.green,
  'low-stock': PILL_COLORS.amber,
  'out-of-stock': PILL_COLORS.red,
}

const STOCK_LABEL: Record<ProductStockStatus, string> = {
  'in-stock': 'In stock',
  'low-stock': 'Low stock',
  'out-of-stock': 'Out of stock',
}

const columns: Column<ProductRow>[] = [
  {
    key: 'name',
    header: 'Product',
    sortable: true,
    skeletonWidth: 'w-44',
    render: (r) => (
      <div className="min-w-0">
        <div className="truncate text-ink">{r.name}</div>
        <div className="truncate font-mono text-[11px] text-muted">{r.sku}</div>
      </div>
    ),
  },
  {
    key: 'qtySold',
    header: 'Qty sold',
    align: 'right',
    sortable: true,
    skeletonWidth: 'w-10',
    render: (r) => <span className="tabular-nums text-ink">{formatInteger(r.qtySold)}</span>,
  },
  {
    key: 'orders',
    header: 'Orders',
    align: 'right',
    sortable: true,
    skeletonWidth: 'w-10',
    render: (r) => <span className="tabular-nums text-muted">{formatInteger(r.orders)}</span>,
  },
  {
    key: 'avgPrice',
    header: 'Avg price',
    align: 'right',
    sortable: true,
    skeletonWidth: 'w-16',
    render: (r) => <span className="tabular-nums text-muted">{formatCurrency(r.avgPrice)}</span>,
  },
  {
    key: 'refunded',
    header: 'Refunded',
    align: 'right',
    skeletonWidth: 'w-16',
    render: (r) => (
      <span className="tabular-nums text-muted">{formatCurrency(r.refunded)}</span>
    ),
  },
  {
    key: 'stock',
    header: 'Stock',
    align: 'right',
    sortable: true,
    skeletonWidth: 'w-20',
    render: (r) => (
      <span className="inline-flex items-center gap-2">
        <span className="tabular-nums text-muted">{formatInteger(r.stock)}</span>
        <Pill color={STOCK_COLOR[r.stockStatus]}>{STOCK_LABEL[r.stockStatus]}</Pill>
      </span>
    ),
  },
  {
    key: 'revenue',
    header: 'Revenue',
    align: 'right',
    sortable: true,
    skeletonWidth: 'w-20',
    render: (r) => <span className="tabular-nums text-ink">{formatCurrency(r.revenue)}</span>,
  },
]

export function ProductsPage() {
  const { range } = useRange()
  const { query, setPage, toggleSort } = useListState('revenue', 25)
  const products = useProducts(range, query)
  const data = products.data

  return (
    <>
      <PageHeader
        title="Products"
        subtitle={`Product performance for ${formatRangeLabel(range)}`}
      />

      <SourceBanner
        error={products.error}
        onRetry={products.refetch}
        retrying={products.isFetching}
      />

      <div className="flex flex-col gap-6">
        <KpiGrid
          loading={products.isLoading}
          failed={!!products.error}
          items={[
            { label: 'Products Sold', metric: data?.productsSold, format: formatInteger, icon: Package },
            { label: 'Product Revenue', metric: data?.productRevenue, format: formatCurrency, icon: DollarSign },
            { label: 'Avg Price', metric: data?.avgPrice, format: formatCurrency, icon: Tag },
            {
              label: 'Refund Rate',
              metric: data?.refundRate,
              format: formatPercent,
              icon: RotateCcw,
              polarity: 'down-good',
            },
          ]}
        />

        <DataTable
          title="All Products"
          subtitle={`${formatInteger(data?.total ?? 0)} products sold in selected period`}
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
          loading={products.isLoading}
          fetching={products.isFetching}
          unavailable={products.error ? 'Products unavailable' : undefined}
          noun="products"
        />
      </div>
    </>
  )
}
