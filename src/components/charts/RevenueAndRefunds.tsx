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
import type { RefundPoint, RevenuePoint, TrafficPoint } from '../../lib/types'
import {
  formatAxisCurrency,
  formatCompactInteger,
  formatCurrency,
  formatDay,
  formatInteger,
  formatPercent,
} from '../../lib/format'
import { ChartCard, TooltipCard } from './ChartCard'

/*
 * Five series, five colours, and every axis printed in the colour of the line
 * it measures.
 *
 * The set was chosen with the palette validator rather than by eye: every pair
 * clears the normal-vision separation floor (worst 16.5) and every colour
 * clears 3:1 against the card. No five-colour set can clear the colour-vision
 * floors as well — red against green collapses to almost nothing for a protan
 * or deutan reader, and that is a property of the eye rather than of the
 * palette. So colour is never what carries identity here: each line has its
 * own axis in its own colour, the legend names all five, and the tooltip
 * prints every value with its label.
 */
const REVENUE = '#d4d4d8'
const REFUND = '#f2666a'
const VISITORS = '#4a9eff'
const ORDERS = '#e3b341'
const RATE = '#2ec27e'
const FILL = 'refundArea'

interface RevenueAndRefundsProps {
  revenue: RevenuePoint[]
  refunds: RefundPoint[]
  /** Daily visitors, orders and conversion from the analytics provider. */
  traffic: TrafficPoint[]
  loading?: boolean
  unavailable?: string
}

interface Point {
  date: string
  revenue: number
  refunds: number
  /** Null on a day the provider did not report, which is not a day of nobody. */
  visitors: number | null
  orders: number | null
  conversionRate: number | null
  /** The rate in percentage points, which is what its axis plots. */
  ratePoints: number | null
}

/**
 * The trading day in full: what came in, what it earned, and what went back.
 *
 * One plot with four scales, because the five series carry three units two
 * orders of magnitude apart — revenue near $700 a day, visitors near 600,
 * orders near 12, conversion near 0.02. Forced onto a single axis the orders
 * and the rate lie flat against the baseline and are not there at all.
 *
 * Giving each its own axis makes every line legible, at a cost worth naming:
 * the heights are no longer comparable between series, and a crossing point
 * says nothing except where the axes happened to be set. The axes are printed
 * in their lines' own colours so that the trade is at least visible — a reader
 * following the amber line reads the amber numbers, and never infers anything
 * from amber sitting above blue.
 *
 * Revenue and refunds are the one pair that does share a scale, deliberately.
 * They are both money and the comparison between them is the point: on
 * separate axes a $173 refund drew taller than $1,070 of revenue, which
 * inverted the very thing the pair exists to show.
 */
export function RevenueAndRefunds({
  revenue,
  refunds,
  traffic,
  loading,
  unavailable,
}: RevenueAndRefundsProps) {
  /*
   * Merged on the union of dates rather than by walking one series — the money
   * and the traffic come from different places and neither is guaranteed to
   * cover the other's days. Joining on one of them would silently drop a day
   * the other knew about.
   */
  const data = useMemo<Point[]>(() => {
    const byRevenue = new Map(revenue.map((p) => [p.date, p.revenue]))
    const byRefund = new Map(refunds.map((p) => [p.date, p.refunds]))
    const byTraffic = new Map(traffic.map((p) => [p.date, p]))

    const dates = [...new Set([...byRevenue.keys(), ...byTraffic.keys()])].sort((a, b) =>
      a.localeCompare(b),
    )

    return dates.map((date) => {
      const point = byTraffic.get(date)
      return {
        date,
        revenue: byRevenue.get(date) ?? 0,
        refunds: byRefund.get(date) ?? 0,
        visitors: point?.visitors ?? null,
        orders: point?.orders ?? null,
        conversionRate: point?.conversionRate ?? null,
        ratePoints: point ? point.conversionRate * 100 : null,
      }
    })
  }, [revenue, refunds, traffic])

  const refunded = data.reduce((sum, p) => sum + p.refunds, 0)
  const refundDays = data.filter((p) => p.refunds > 0).length
  const visitors = data.reduce((sum, p) => sum + (p.visitors ?? 0), 0)
  const orders = data.reduce((sum, p) => sum + (p.orders ?? 0), 0)

  return (
    <ChartCard
      title="Revenue and Refunds Over Time"
      subtitle={
        `${
          visitors > 0
            ? `${formatInteger(visitors)} visitors and ${formatInteger(orders)} orders`
            : 'Daily revenue, refunds, visitors, orders and conversion'
        }${
          refunded > 0
            ? `, against ${formatCurrency(refunded)} refunded across ${refundDays} ${
                refundDays === 1 ? 'day' : 'days'
              }`
            : ', with nothing refunded'
        }. Each line is read against the axis printed in its own colour — the ` +
        `heights are not comparable between series. Revenue and refunds are the ` +
        `one pair sharing a scale, because that comparison is the point.`
      }
      height={440}
      loading={loading}
      unavailable={unavailable}
    >
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 4, left: 0 }}>
              <defs>
                <linearGradient id={FILL} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={REFUND} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={REFUND} stopOpacity={0.02} />
                </linearGradient>
              </defs>

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

              {/* Money, shared by revenue and refunds. Printed in the revenue
                  colour: it is the series the scale is set by, and refunds are
                  named in the legend and the tooltip rather than by their axis. */}
              <YAxis
                yAxisId="money"
                orientation="left"
                tickFormatter={formatAxisCurrency}
                tick={{ fill: REVENUE, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={62}
              />

              <YAxis
                yAxisId="visitors"
                orientation="left"
                tickFormatter={formatCompactInteger}
                tick={{ fill: VISITORS, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={44}
              />

              <YAxis
                yAxisId="orders"
                orientation="right"
                tickFormatter={formatCompactInteger}
                tick={{ fill: ORDERS, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={40}
              />

              <YAxis
                yAxisId="rate"
                orientation="right"
                tickFormatter={(value: number) => `${value.toFixed(1)}%`}
                tick={{ fill: RATE, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={48}
              />

              <Tooltip
                content={<DayTooltip />}
                cursor={{ stroke: '#4a4a52', strokeWidth: 1 }}
              />

              {/* Refunds first, so the fill sits behind the revenue line rather
                  than washing over it. */}
              <Area
                yAxisId="money"
                type="monotone"
                dataKey="refunds"
                stroke={REFUND}
                strokeWidth={2}
                fill={`url(#${FILL})`}
                dot={(props: { cx?: number; cy?: number; payload?: Point }) => {
                  const { cx, cy, payload } = props
                  if (
                    !payload ||
                    payload.refunds <= 0 ||
                    cx === undefined ||
                    cy === undefined
                  ) {
                    return <g key={payload?.date ?? 'none'} />
                  }
                  return <circle key={payload.date} cx={cx} cy={cy} r={2.5} fill={REFUND} />
                }}
                activeDot={{ r: 4, fill: REFUND, stroke: '#161618', strokeWidth: 2 }}
                isAnimationActive={false}
              />

              <Line
                yAxisId="visitors"
                type="monotone"
                dataKey="visitors"
                stroke={VISITORS}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: VISITORS, stroke: '#161618', strokeWidth: 2 }}
                isAnimationActive={false}
                connectNulls={false}
              />

              <Line
                yAxisId="orders"
                type="monotone"
                dataKey="orders"
                stroke={ORDERS}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: ORDERS, stroke: '#161618', strokeWidth: 2 }}
                isAnimationActive={false}
                connectNulls={false}
              />

              <Line
                yAxisId="rate"
                type="monotone"
                dataKey="ratePoints"
                stroke={RATE}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: RATE, stroke: '#161618', strokeWidth: 2 }}
                isAnimationActive={false}
                connectNulls={false}
              />

              {/* Last, so revenue draws over the rest — it is the line the card
                  is named for. */}
              <Line
                yAxisId="money"
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

        {/* Names every series and says which axis reads it, so identity never
            rests on telling two hues apart. */}
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-2 text-[12px] text-muted">
          <Key color={REVENUE}>Revenue</Key>
          <Key color={REFUND}>Refunded</Key>
          <Key color={VISITORS}>Visitors</Key>
          <Key color={ORDERS}>Orders</Key>
          <Key color={RATE}>Conversion rate</Key>
        </div>
        <p className="shrink-0 pt-1 text-center text-[11px] text-label">
          Left: revenue and refunds, then visitors. Right: orders, then
          conversion. Each axis is printed in its line&apos;s colour.
        </p>
      </div>
    </ChartCard>
  )
}

/** A line sample and its name, drawn in the series' own colour. */
function Key({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="22" height="10" aria-hidden>
        <line x1="0" y1="5" x2="22" y2="5" stroke={color} strokeWidth="2" />
        <circle cx="11" cy="5" r="3" fill="#161618" stroke={color} strokeWidth="2" />
      </svg>
      {children}
    </span>
  )
}

function DayTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { payload?: Point }[]
  label?: string
}) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null

  return (
    <TooltipCard>
      <div className="flex flex-col gap-0.5 tabular-nums">
        {label && <span className="font-medium">{formatDay(label)}</span>}
        <span>Revenue : {formatCurrency(point.revenue)}</span>
        <span style={{ color: '#b3261e' }}>
          {point.refunds > 0
            ? `Refunded : −${formatCurrency(point.refunds)}`
            : 'No refunds'}
        </span>
        {/* A dash rather than a nought: the provider not reporting a day and
            nobody arriving on it are different claims. */}
        <span style={{ color: '#1b5fa8' }}>
          Visitors : {point.visitors === null ? '—' : formatInteger(point.visitors)}
        </span>
        <span style={{ color: '#8a6100' }}>
          Orders : {point.orders === null ? '—' : formatInteger(point.orders)}
        </span>
        <span style={{ color: '#12694b' }}>
          Conversion :{' '}
          {point.conversionRate === null ? '—' : formatPercent(point.conversionRate)}
        </span>
      </div>
    </TooltipCard>
  )
}
