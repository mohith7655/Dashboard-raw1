import { useMemo } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { RefundPoint, RevenuePoint } from '../../lib/types'
import { formatAxisCurrency, formatCurrency, formatDay } from '../../lib/format'
import { ChartCard, TooltipCard } from './ChartCard'

const REVENUE = '#d4d4d8'
const REFUND = '#ef6f66'
const FILL = 'refundArea'

interface RevenueAndRefundsProps {
  revenue: RevenuePoint[]
  refunds: RefundPoint[]
  loading?: boolean
  unavailable?: string
}

interface Point {
  date: string
  revenue: number
  refunds: number
}

interface TooltipPayloadItem {
  dataKey?: string | number
  value?: number | string
}

function CombinedTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const read = (key: string) =>
    Number(payload.find((item) => item.dataKey === key)?.value ?? 0)
  const refunded = read('refunds')

  return (
    <TooltipCard>
      <div className="flex flex-col gap-0.5 tabular-nums">
        {label && <span className="font-medium">{formatDay(label)}</span>}
        <span>Revenue : {formatCurrency(read('revenue'))}</span>
        <span style={{ color: '#b3261e' }}>
          {refunded > 0 ? `Refunded : −${formatCurrency(refunded)}` : 'No refunds'}
        </span>
      </div>
    </TooltipCard>
  )
}

/**
 * Both series on one plot and one scale.
 *
 * A second axis was tried and taken back out. It made each line legible on its
 * own terms but not against the other: $173 of refunds drew taller than $1,070
 * of revenue, which is the one comparison this chart exists to make. On a
 * shared scale refunds sit low, and a day where they do not is the day worth
 * seeing. The fill keeps a small figure visible where a bare line would nearly
 * vanish against the axis.
 */
export function RevenueAndRefunds({
  revenue,
  refunds,
  loading,
  unavailable,
}: RevenueAndRefundsProps) {
  // Both series are emitted a day at a time across the same range, so they
  // align by date. Merged through a map regardless, rather than by index —
  // one series arriving short would otherwise slide every refund onto the
  // wrong day rather than simply going missing.
  const data = useMemo<Point[]>(() => {
    const byDate = new Map(refunds.map((point) => [point.date, point.refunds]))
    return revenue.map((point) => ({
      date: point.date,
      revenue: point.revenue,
      refunds: byDate.get(point.date) ?? 0,
    }))
  }, [revenue, refunds])

  const refunded = data.reduce((sum, point) => sum + point.refunds, 0)
  const days = data.filter((point) => point.refunds > 0).length

  return (
    <ChartCard
      title="Revenue and Refunds Over Time"
      subtitle={
        refunded > 0
          ? `Daily revenue against ${formatCurrency(refunded)} refunded across ${days} ${
              days === 1 ? 'day' : 'days'
            } — on the same scale`
          : 'Daily revenue from completed & processing orders. Nothing was refunded in this period'
      }
      height={360}
      loading={loading}
      unavailable={unavailable}
    >
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
              <defs>
                <linearGradient id={FILL} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={REFUND} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={REFUND} stopOpacity={0.02} />
                </linearGradient>
              </defs>

              <CartesianGrid stroke="#232327" strokeWidth={1} vertical={false} />

              <XAxis
                dataKey="date"
                tickFormatter={formatDay}
                interval={1}
                tick={{ fill: '#8a8a92', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: '#262629' }}
                minTickGap={0}
              />

              {/* One scale for both. A second axis made the two lines
                  legible on their own terms but not against each other — a
                  $173 refund drew taller than $1,070 of revenue, which is the
                  one comparison the chart exists to make. Refunds are small
                  here, and that is the honest picture of them. */}
              <YAxis
                tickFormatter={formatAxisCurrency}
                tick={{ fill: '#8a8a92', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={64}
              />

              <Tooltip
                content={<CombinedTooltip />}
                cursor={{ stroke: '#4a4a52', strokeWidth: 1 }}
              />

              {/* Refunds first, so the fill sits behind the revenue line
                  rather than washing over it. */}
              <Area
                type="monotone"
                dataKey="refunds"
                stroke={REFUND}
                strokeWidth={2}
                fill={`url(#${FILL})`}
                dot={(props: { cx?: number; cy?: number; payload?: Point }) => {
                  const { cx, cy, payload } = props
                  if (!payload || payload.refunds <= 0 || cx === undefined || cy === undefined) {
                    return <g key={payload?.date ?? 'none'} />
                  }
                  return <circle key={payload.date} cx={cx} cy={cy} r={2.5} fill={REFUND} />
                }}
                activeDot={{ r: 4, fill: REFUND, stroke: '#161618', strokeWidth: 2 }}
                isAnimationActive={false}
              />

              <Line
                type="monotone"
                dataKey="revenue"
                stroke={REVENUE}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: REVENUE, stroke: '#161618', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-5 gap-y-1 pt-2 text-[12px] text-muted">
          <span className="flex items-center gap-2">
            <svg width="26" height="10" aria-hidden>
              <line x1="0" y1="5" x2="26" y2="5" stroke={REVENUE} strokeWidth="2" />
              <circle cx="13" cy="5" r="3.5" fill="#161618" stroke={REVENUE} strokeWidth="2" />
            </svg>
            Revenue
          </span>
          <span className="flex items-center gap-2">
            <svg width="26" height="10" aria-hidden>
              <line x1="0" y1="5" x2="26" y2="5" stroke={REFUND} strokeWidth="2" />
              <circle cx="13" cy="5" r="3.5" fill="#161618" stroke={REFUND} strokeWidth="2" />
            </svg>
            Refunded
          </span>
        </div>
      </div>
    </ChartCard>
  )
}
