import { DollarSign, Percent, Scissors, TicketPercent } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { KpiGrid } from '../components/KpiGrid'
import { SourceBanner } from '../components/SourceBanner'
import { DataTable, type Column } from '../components/DataTable'
import { Pill, PILL_COLORS } from '../components/Pill'
import { useRange } from '../lib/rangeContext'
import { useCoupons } from '../lib/resourceQueries'
import { useListState } from '../lib/useListState'
import { formatCurrency, formatDate, formatInteger } from '../lib/format'
import { formatRangeLabel } from '../lib/dateRange'
import type { CouponRow, CouponType } from '../lib/data/types'

const TYPE_LABEL: Record<CouponType, string> = {
  percent: 'Percentage',
  fixed_cart: 'Fixed cart',
  fixed_product: 'Fixed product',
}

const TYPE_COLOR: Record<CouponType, string> = {
  percent: PILL_COLORS.blue,
  fixed_cart: PILL_COLORS.violet,
  fixed_product: PILL_COLORS.grey,
}

const columns: Column<CouponRow>[] = [
  {
    key: 'code',
    header: 'Code',
    sortable: true,
    skeletonWidth: 'w-28',
    render: (r) => <span className="font-mono text-ink">{r.code}</span>,
  },
  {
    key: 'type',
    header: 'Type',
    skeletonWidth: 'w-24',
    render: (r) => <Pill color={TYPE_COLOR[r.type]}>{TYPE_LABEL[r.type]}</Pill>,
  },
  {
    key: 'amount',
    header: 'Amount',
    align: 'right',
    sortable: true,
    skeletonWidth: 'w-12',
    render: (r) => (
      <span className="tabular-nums text-ink">
        {r.type === 'percent' ? `${r.amount}%` : formatCurrency(r.amount)}
      </span>
    ),
  },
  {
    key: 'used',
    header: 'Used',
    align: 'right',
    sortable: true,
    skeletonWidth: 'w-16',
    render: (r) => (
      <span className="tabular-nums text-muted">
        {formatInteger(r.used)}
        {r.usageLimit !== null && ` / ${formatInteger(r.usageLimit)}`}
      </span>
    ),
  },
  {
    key: 'expires',
    header: 'Expires',
    align: 'right',
    skeletonWidth: 'w-24',
    render: (r) => (
      <span className="tabular-nums text-muted">
        {r.expires ? formatDate(r.expires) : 'Never'}
      </span>
    ),
  },
  {
    key: 'discount',
    header: 'Discount',
    align: 'right',
    sortable: true,
    skeletonWidth: 'w-20',
    render: (r) => <span className="tabular-nums text-neg">{formatCurrency(r.discount)}</span>,
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

export function CouponsPage() {
  const { range } = useRange()
  const { query, setPage, toggleSort } = useListState('revenue', 25)
  const coupons = useCoupons(range, query)
  const data = coupons.data

  return (
    <>
      <PageHeader
        title="Coupons"
        subtitle={`Coupon usage and discount cost for ${formatRangeLabel(range)}`}
      />

      <SourceBanner
        error={coupons.error}
        onRetry={coupons.refetch}
        retrying={coupons.isFetching}
      />

      <div className="flex flex-col gap-6">
        <KpiGrid
          loading={coupons.isLoading}
          failed={!!coupons.error}
          items={[
            { label: 'Coupons Used', metric: data?.couponsUsed, format: formatInteger, icon: TicketPercent },
            {
              label: 'Discount Total',
              metric: data?.discountTotal,
              format: formatCurrency,
              icon: Scissors,
              polarity: 'down-good',
            },
            { label: 'Coupon Revenue', metric: data?.couponRevenue, format: formatCurrency, icon: DollarSign },
            {
              label: 'Avg Discount',
              metric: data?.avgDiscount,
              format: formatCurrency,
              icon: Percent,
              polarity: 'down-good',
            },
          ]}
        />

        <DataTable
          title="All Coupons"
          subtitle={`${formatInteger(data?.total ?? 0)} coupons used in selected period`}
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
          loading={coupons.isLoading}
          fetching={coupons.isFetching}
          unavailable={coupons.error ? 'Coupons unavailable' : undefined}
          noun="coupons"
        />
      </div>
    </>
  )
}
