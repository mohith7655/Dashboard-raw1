import { useMemo } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { RefundPoint, TrafficPoint } from '../../lib/types'
import {
  formatCurrency,
  formatDay,
  formatInteger,
  formatPercent,
} from '../../lib/format'
import { ChartCard, TooltipCard } from './ChartCard'

const VISITORS = '#4a6fa5'
const ORDERS = '#d4d4d8'
const REFUNDS = '#ef6f66'
const RATE = '#4ade80'

interface TrafficAndOrdersProps {
  traffic: TrafficPoint[]
  refunds: RefundPoint[]
  loading?: boolean
  unavailable?: string
}

interface Point {
  date: string
  visitors: number
  orders: number
  refunds: number
  conversionRate: number
  ratePoints: number
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

  // Each line names its own unit. The plot puts three of them on two axes, so
  // the tooltip is where the reader confirms what they are looking at.
  return (
    <TooltipCard>
      <div className="flex flex-col gap-0.5 tabular-nums">
        {label && <span className="font-medium">{formatDay(label)}</span>}
        <span>Visitors : {formatInteger(read('visitors'))}</span>
        <span>Orders : {formatInteger(read('orders'))}</span>
        <span style={{ color: '#1a7f37' }}>
          Conversion : {formatPercent(read('conversionRate'))}
        </span>
        <span style={{ color: '#b3261e' }}>
          {refunded > 0 ? `Refunded : ${formatCurrency(refunded)}` : 'No refunds'}
        </span>
      </div>
    </TooltipCard>
  )
}

/**
 * The funnel a day at a time: who arrived, how many bought, at what rate, and
 * what went back.
 *
 * Four series, three units and two axes, paired by magnitude rather than by
 * kind — because the alternative does not render.
 *
 * This store runs ~700 visitors and ~14 orders a day. On one axis the order
 * bars stand two percent of the plot height and simply are not there; the
 * chart would show traffic and nothing else. So the large figures share the
 * left — visitors, and the refunds that reach a few hundred — and the small
 * ones share the right, orders against a conversion rate expressed in
 * percentage points rather than as a fraction.
 *
 * That does mean each axis carries two units, which is why neither is labelled
 * with one and why the tooltip names all four in full. It is the honest trade:
 * an axis that reads as approximate against a plot where every series is
 * visible, rather than a tidy axis and an invisible one.
 *
 * Bars for the three that are quantities of a thing, a line for the rate that
 * describes a relationship between two of them. That is the distinction the eye
 * reads before any label does.
 */
export function TrafficAndOrders({
  traffic,
  refunds,
  loading,
  unavailable,
}: TrafficAndOrdersProps) {
  // Merged by date rather than by index: one series arriving short would
  // otherwise slide every refund onto the wrong day rather than going missing.
  const data = useMemo<Point[]>(() => {
    const byDate = new Map(refunds.map((point) => [point.date, point.refunds]))
    return traffic.map((point) => ({
      date: point.date,
      visitors: point.visitors,
      orders: point.orders,
      refunds: byDate.get(point.date) ?? 0,
      conversionRate: point.conversionRate,
      // Percentage points, so the rate can share the small axis with orders.
      // The fraction stays on the record for the tooltip to format properly.
      ratePoints: point.conversionRate * 100,
    }))
  }, [traffic, refunds])

  const visitors = data.reduce((sum, p) => sum + p.visitors, 0)
  const orders = data.reduce((sum, p) => sum + p.orders, 0)

  return (
    <ChartCard
      title="Visitors, Orders and Refunds"
      subtitle={
        visitors > 0
          ? `${formatInteger(visitors)} visitors and ${formatInteger(orders)} orders over the period. Visitors and refunds read on the left, orders and conversion rate on the right — the two scales differ by fifty times`
          : 'Daily visitors, orders, conversion rate and refunds'
      }
      height={380}
      loading={loading}
      unavailable={unavailable}
    >
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
              <CartesianGrid stroke="#232327" strokeWidth={1} vertical={false} />

              <XAxis
                dataKey="date"
                tickFormatter={formatDay}
                interval="preserveStartEnd"
                tick={{ fill: '#8a8a92', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: '#262629' }}
                minTickGap={16}
              />

              {/* The large figures: visitors, and the refunds that reach a
                  few hundred. Unlabelled, because it carries two units. */}
              <YAxis
                yAxisId="high"
                tickFormatter={(value: number) => formatInteger(value)}
                tick={{ fill: '#8a8a92', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={48}
              />

              {/* The small ones: orders, and the conversion rate in percentage
                  points. Both sit under twenty here, which is the only reason
                  they can share a scale at all. */}
              <YAxis
                yAxisId="low"
                orientation="right"
                tickFormatter={(value: number) => formatInteger(value)}
                tick={{ fill: '#8a8a92', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={40}
              />

              <Tooltip
                content={<CombinedTooltip />}
                cursor={{ fill: '#ffffff08' }}
              />

              <Bar
                yAxisId="high"
                dataKey="visitors"
                fill={VISITORS}
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              />
              <Bar
                yAxisId="high"
                dataKey="refunds"
                fill={REFUNDS}
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              />
              <Bar
                yAxisId="low"
                dataKey="orders"
                fill={ORDERS}
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              />

              {/* Last, so the rate draws over the bars rather than behind. */}
              <Line
                yAxisId="low"
                type="monotone"
                dataKey="ratePoints"
                stroke={RATE}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: RATE, stroke: '#161618', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-5 gap-y-1 pt-2 text-[12px] text-muted">
          <Key color={VISITORS}>Visitors</Key>
          <Key color={ORDERS}>Orders</Key>
          <Key color={REFUNDS}>Refunded</Key>
          <Key color={RATE} line>
            Conversion rate
          </Key>
        </div>
      </div>
    </ChartCard>
  )
}

/** A swatch and its name; a line for the rate, a block for the quantities. */
function Key({
  color,
  line = false,
  children,
}: {
  color: string
  line?: boolean
  children: React.ReactNode
}) {
  return (
    <span className="flex items-center gap-2">
      {line ? (
        <svg width="26" height="10" aria-hidden>
          <line x1="0" y1="5" x2="26" y2="5" stroke={color} strokeWidth="2" />
          <circle cx="13" cy="5" r="3.5" fill="#161618" stroke={color} strokeWidth="2" />
        </svg>
      ) : (
        <span
          aria-hidden
          className="h-2.5 w-2.5 rounded-[2px]"
          style={{ background: color }}
        />
      )}
      {children}
    </span>
  )
}
