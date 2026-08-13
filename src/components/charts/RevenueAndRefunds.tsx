import { useMemo } from 'react'
import type { ReactNode } from 'react'
import {
  Area,
  Bar,
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
import { Skeleton } from '../Skeleton'
import { TooltipCard } from './ChartCard'

const REVENUE = '#d4d4d8'
const REFUND = '#e66767'
const VISITORS = '#3987e5'
const ORDERS = '#c98500'
const RATE = '#199e70'
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
  /** The rate in percentage points, which is what the axis plots. */
  ratePoints: number | null
}

/**
 * The trading day in full: what came in, what it earned, and what went back.
 *
 * This replaces two cards that each showed half of it — one revenue against
 * refunds, one visitors against orders — and made the reader hold a day in
 * their head while scrolling between them.
 *
 * It is four aligned panels rather than one plot, and that is not a
 * presentational preference. The five series carry three units and magnitudes
 * two orders of magnitude apart: revenue near $700 a day, visitors near 600,
 * orders near 12, conversion near 0.02. On one scale the orders and the rate
 * lie flat on the axis and are simply not there. On two scales the crossings
 * between series become an artefact of where the axes were set rather than
 * anything in the data — and a reader comparing a revenue bar against a
 * visitors bar of the same height would be comparing dollars against people.
 *
 * Faceting also fixes what colour could not. Four series in one plot cannot be
 * told apart reliably: no four hues in this palette clear the contrast floors
 * against each other for a reader with colour-vision deficiency. One series to
 * a panel needs no legend and no hue matching at all — the panel's own title
 * names it.
 *
 * The panels share an x domain and only the last carries its labels, so a day
 * is read straight down the card.
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

    const dates = [
      ...new Set([...byRevenue.keys(), ...byTraffic.keys()]),
    ].sort((a, b) => a.localeCompare(b))

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
    <div className="card">
      <h3 className="text-[15px] font-semibold text-ink">Revenue and Refunds Over Time</h3>
      <p className="mt-0.5 max-w-prose text-[12px] leading-relaxed text-muted">
        {visitors > 0
          ? `${formatInteger(visitors)} visitors and ${formatInteger(orders)} orders over the period`
          : 'Daily revenue, refunds, visitors, orders and conversion'}
        {refunded > 0
          ? `, against ${formatCurrency(refunded)} refunded across ${refundDays} ${
              refundDays === 1 ? 'day' : 'days'
            }`
          : ', with nothing refunded'}
        . Each measure keeps its own scale — dollars, people and a rate do not
        share an axis honestly — and the panels share a timeline, so a day reads
        straight down the card.
      </p>

      {loading ? (
        <div className="mt-4 flex flex-col gap-3">
          <Skeleton className="h-[150px] w-full" />
          <Skeleton className="h-[90px] w-full" />
          <Skeleton className="h-[90px] w-full" />
        </div>
      ) : unavailable ? (
        <div className="flex h-[200px] items-center justify-center text-[13px] text-muted">
          {unavailable}
        </div>
      ) : (
        <div className="mt-4 flex flex-col">
          {/* The headline, and the only panel carrying two series — both are
              money on one scale, which is the comparison it exists to make. */}
          <Panel
            label="Revenue and refunds"
            note={refunded > 0 ? formatCurrency(refunded) + ' refunded' : 'no refunds'}
            height={168}
            data={data}
            axisFormat={formatAxisCurrency}
            axisWidth={AXIS}
          >
            <defs>
              <linearGradient id={FILL} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={REFUND} stopOpacity={0.3} />
                <stop offset="100%" stopColor={REFUND} stopOpacity={0.02} />
              </linearGradient>
            </defs>

            {/* Refunds first, so the fill sits behind the revenue line rather
                than washing over it. Both on one scale: a second axis made a
                $173 refund draw taller than $1,070 of revenue, which is the
                one comparison this pair exists to make. */}
            <Area
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
              type="monotone"
              dataKey="revenue"
              stroke={REVENUE}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: REVENUE, stroke: '#161618', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </Panel>

          <Panel
            label="Visitors"
            note={visitors > 0 ? formatInteger(visitors) + ' over the period' : ''}
            height={104}
            data={data}
            axisFormat={formatCompactInteger}
            axisWidth={AXIS}
          >
            <Bar
              dataKey="visitors"
              fill={VISITORS}
              radius={[2, 2, 0, 0]}
              isAnimationActive={false}
            />
          </Panel>

          <Panel
            label="Orders"
            note={orders > 0 ? formatInteger(orders) + ' over the period' : ''}
            height={104}
            data={data}
            axisFormat={formatCompactInteger}
            axisWidth={AXIS}
          >
            <Bar
              dataKey="orders"
              fill={ORDERS}
              radius={[2, 2, 0, 0]}
              isAnimationActive={false}
            />
          </Panel>

          {/* Last, and the only one showing its dates — the panels share a
              domain, so one set of labels serves all four. */}
          <Panel
            label="Conversion rate"
            note="orders as a share of visitors"
            height={128}
            data={data}
            axisFormat={(value: number) => `${value.toFixed(1)}%`}
            axisWidth={AXIS}
            showDates
          >
            <Line
              type="monotone"
              dataKey="ratePoints"
              stroke={RATE}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: RATE, stroke: '#161618', strokeWidth: 2 }}
              isAnimationActive={false}
              connectNulls={false}
            />
          </Panel>
        </div>
      )}
    </div>
  )
}

/** One width for every panel's axis, which is what keeps the plots aligned. */
const AXIS = 64

interface PanelProps {
  label: string
  note: string
  height: number
  data: Point[]
  axisFormat: (value: number) => string
  axisWidth: number
  /** Only the bottom panel prints the dates; the rest share its domain. */
  showDates?: boolean
  children: ReactNode
}

function Panel({
  label,
  note,
  height,
  data,
  axisFormat,
  axisWidth,
  showDates = false,
  children,
}: PanelProps) {
  return (
    <div>
      <div
        className="flex items-baseline gap-2 pb-1 text-[11px] uppercase tracking-[0.06em]"
        style={{ paddingLeft: axisWidth }}
      >
        <span className="text-label">{label}</span>
        {note && <span className="text-[11px] normal-case tracking-normal text-muted">{note}</span>}
      </div>

      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid stroke="#232327" strokeWidth={1} vertical={false} />

            <XAxis
              dataKey="date"
              tickFormatter={formatDay}
              interval="preserveStartEnd"
              tick={showDates ? { fill: '#8a8a92', fontSize: 11 } : false}
              tickLine={false}
              axisLine={{ stroke: '#262629' }}
              minTickGap={16}
              height={showDates ? 28 : 4}
            />

            <YAxis
              tickFormatter={axisFormat}
              tick={{ fill: '#8a8a92', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={axisWidth}
            />

            {/* Every panel names the whole day, not just its own series — the
                panels share a timeline, so hovering anywhere should answer
                what that day did rather than a quarter of it. */}
            <Tooltip
              content={<DayTooltip />}
              cursor={{ stroke: '#4a4a52', strokeWidth: 1 }}
            />

            {children}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
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
          {point.refunds > 0 ? `Refunded : −${formatCurrency(point.refunds)}` : 'No refunds'}
        </span>
        {/* A dash rather than a nought: the provider not reporting a day and
            nobody arriving on it are different claims. */}
        <span>
          Visitors : {point.visitors === null ? '—' : formatInteger(point.visitors)}
        </span>
        <span>Orders : {point.orders === null ? '—' : formatInteger(point.orders)}</span>
        <span style={{ color: '#12694b' }}>
          Conversion :{' '}
          {point.conversionRate === null ? '—' : formatPercent(point.conversionRate)}
        </span>
      </div>
    </TooltipCard>
  )
}
