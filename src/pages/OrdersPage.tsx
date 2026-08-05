import { useState } from 'react'
import { DollarSign, Package, ShoppingCart, Users } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { KpiGrid } from '../components/KpiGrid'
import { SourceBanner } from '../components/SourceBanner'
import { RecentOrders } from '../components/RecentOrders'
import { OrdersByStatus } from '../components/charts/OrdersByStatus'
import { useRange } from '../lib/rangeContext'
import { useOrders, useWooMetrics } from '../lib/queries'
import { formatCurrency, formatInteger } from '../lib/format'
import { formatRangeLabel } from '../lib/dateRange'
import type { OrderSortField, SortDirection } from '../lib/types'

const PER_PAGE = 25

export function OrdersPage() {
  const { range, against } = useRange()
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<OrderSortField>('date')
  const [direction, setDirection] = useState<SortDirection>('desc')

  const woo = useWooMetrics(range, against)
  const orders = useOrders(range, { page, perPage: PER_PAGE, sort, direction })

  const onSortChange = (field: OrderSortField) => {
    if (field === sort) setDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSort(field)
      setDirection('desc')
    }
    setPage(1)
  }

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle={`Every order placed between ${formatRangeLabel(range)}`}
      />

      <SourceBanner
        error={woo.error ?? orders.error}
        onRetry={() => {
          woo.refetch()
          orders.refetch()
        }}
        retrying={woo.isFetching || orders.isFetching}
      />

      <div className="flex flex-col gap-6">
        <KpiGrid
          loading={woo.isLoading}
          failed={!!woo.error}
          items={[
            { label: 'Total Orders', metric: woo.data?.totalOrders, format: formatInteger, icon: Package },
            { label: 'Total Sales', metric: woo.data?.totalRevenue, format: formatCurrency, icon: DollarSign },
            { label: 'Avg Order Value', metric: woo.data?.avgOrderValue, format: formatCurrency, icon: ShoppingCart },
            { label: 'New Customers', metric: woo.data?.newCustomers, format: formatInteger, icon: Users },
          ]}
        />

        <OrdersByStatus
          data={woo.data?.ordersByStatus ?? []}
          loading={woo.isLoading}
          unavailable={woo.error ? 'Order status data unavailable' : undefined}
        />

        <RecentOrders
          page={orders.data ?? null}
          sort={sort}
          direction={direction}
          onSortChange={onSortChange}
          onPageChange={setPage}
          loading={orders.isLoading}
          fetching={orders.isFetching}
          unavailable={orders.error ? 'Orders unavailable' : undefined}
        />
      </div>
    </>
  )
}
