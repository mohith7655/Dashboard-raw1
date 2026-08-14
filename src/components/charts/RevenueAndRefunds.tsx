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
 * palette. So colour is never what carries identity here: the two bars differ
 * in texture as well as hue, each series has its own axis printed in its own
 * colour, the legend names all five, and the tooltip prints every value with
 * its label.
 */
const REVENUE = '#d4d4d8'
const REFUND = '#f2666a'
const VISITORS = '#4a9eff'
const ORDERS = '#e3b341'
const RATE = '#2ec27e'

/**
 * The hatch filling the upper segment of the bar.
 *
 * The two segments meet along an edge with no gap between them, so the join
 * has to be visible without relying on hue — which is the one gap this palette
 * could not close, since no five colours clear the red-green floors. Hatched
 * against solid survives a colourblind reader, a greyscale print and a bad
 * monitor alike, where two hues touching do not.
 */
const HATCH = 'visitorsHatch'

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
  /**
   * Visitors who did not order — the hatched part of the bar.
   *
   * Plotted rather than `visitors` itself because the two segments are
   * stacked: putting the whole figure on top of the orders under it would draw
   * a bar of visitors plus orders, which is a quantity of nothing. Stacking
   * the remainder makes the bar's full height exactly the visitors.
   */
  visitorsRest: number | null
  /** The rate in percentage points, which is what its axis plots. */
  ratePoints: number | null
}

/**
 * The trading day in full: what came in, what it earned, and what went back.
 *
 * One plot with three scales, because the series carry three units two orders
 * of magnitude apart — revenue near $700 a day, visitors near 600, orders near
 * 12, conversion near 0.02. Forced onto a single axis the orders and the rate
 * lie flat against the baseline and are not there at all.
 *
 * Separate axes make each legible, at a cost worth naming: heights do not
 * compare across them, and a crossing point says nothing except where the axes
 * happened to be set. Each axis is printed in its series' own colour so the
 * trade is at least visible — follow the green line to the green numbers, and
 * infer nothing from green sitting above white.
 *
 * Two pairs do share a scale, both deliberately. Revenue against refunds,
 * because they are both money and that comparison is the point — on separate
 * axes a $173 refund drew taller than $1,070 of revenue, inverting the very
 * thing the pair exists to show. And orders against visitors, as one stacked
 * bar: orders are drawn from the visitors rather than counted beside them, so
 * the column is the day's traffic with the part that bought capping it. That
 * segment runs at about two percent on this store — a sliver, honestly scaled,
 * with the conversion line carrying the rate precisely. It sits on top rather
 * than at the base because a two-percent band is far easier to find against
 * the open air above the bar than against the axis below it.
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
        // Clamped at nought: the two figures come from the same provider on
        // the same day, but an orders count above the visitors count is not
        // impossible — somebody can arrive one day and buy the next — and a
        // negative segment would draw below the axis.
        visitorsRest:
          point === undefined
            ? null
            : Math.max(0, point.visitors - point.orders),
        ratePoints: point ? point.conversionRate * 100 : null,
      }
    })
  }, [revenue, refunds, traffic])


  return (
    <ChartCard
      title="Revenue and Refunds Over Time"
      height={440}
      loading={loading}
      unavailable={unavailable}
    >
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 4, left: 0 }}>
              <defs>
                {/* Drawn at 45° in the visitors colour, on a transparent
                    ground so the grid stays visible through the bar. */}
                <pattern
                  id={HATCH}
                  patternUnits="userSpaceOnUse"
                  width={5}
                  height={5}
                  patternTransform="rotate(45)"
                >
                  <line x1={0} y1={0} x2={0} y2={5} stroke={VISITORS} strokeWidth={2.2} />
                </pattern>
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

              {/* Counts, measuring the whole bar — orders included, since they
                  are a segment of it rather than a series beside it. */}
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

              {/*
                One bar a day, stacked: the visitors who did not order hatched
                below, capped by the orders among them in solid, so the whole
                column is the day's traffic and the solid cap is the share of
                it that bought.

                Both segments therefore read against the visitors axis — a
                stack across two scales would be a shape rather than a
                quantity. Orders lost their own axis to this, which is the
                trade the form demands: the segment is honest, but at roughly
                two percent of the column it is a sliver, and the conversion
                line is what carries the rate precisely.

                Declared before the lines so the bars draw behind them.
              */}
              <Bar
                yAxisId="visitors"
                stackId="funnel"
                dataKey="visitorsRest"
                fill={`url(#${HATCH})`}
                stroke={VISITORS}
                strokeWidth={1}
                isAnimationActive={false}
              />

              {/* Solid, and last of the pair so it caps the column. The
                  rounding rides on this one because it is now the top of the
                  bar — put on the segment underneath it would round a join in
                  the middle of a solid edge. */}
              <Bar
                yAxisId="visitors"
                stackId="funnel"
                dataKey="orders"
                fill={ORDERS}
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              />

              {/* Refunds share the money axis with revenue and sit low on it,
                  so the dots are what make a refund day findable — the line
                  between them runs along the axis on every day without one. */}
              <Line
                yAxisId="money"
                type="monotone"
                dataKey="refunds"
                stroke={REFUND}
                strokeWidth={2}
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
                  return <circle key={payload.date} cx={cx} cy={cy} r={3} fill={REFUND} />
                }}
                activeDot={{ r: 4, fill: REFUND, stroke: '#161618', strokeWidth: 2 }}
                isAnimationActive={false}
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
          <Key color={ORDERS} bar>
            Orders
          </Key>
          <Key color={VISITORS} bar hatch>
            Visitors who did not order
          </Key>
          <Key color={RATE}>Conversion rate</Key>
        </div>
        <p className="shrink-0 pt-1 text-center text-[11px] text-label">
          One bar a day — its full height is that day&apos;s visitors, capped by
          the orders among them. Left: revenue and refunds, then the counts.
          Right: conversion. Each axis is printed in its series&apos; colour.
        </p>
      </div>
    </ChartCard>
  )
}

/**
 * A sample and its name, in the series' own colour.
 *
 * The swatch matches the mark exactly: a hatched outline for visitors, a solid
 * block for orders, a line for the three drawn as lines. That is the
 * distinction the eye reads before it reads any label, so a key that flattened
 * the two bars into one shape would undo the reason they differ.
 */
function Key({
  color,
  bar = false,
  hatch = false,
  children,
}: {
  color: string
  bar?: boolean
  /** Draws the swatch hollow and hatched, as the visitors bars are drawn. */
  hatch?: boolean
  children: React.ReactNode
}) {
  return (
    <span className="flex items-center gap-1.5">
      {bar && hatch ? (
        // Its own miniature of the pattern rather than a reference to the
        // chart's: the plot lives in a separate SVG, and a fill pointing at a
        // pattern defined there resolves to nothing here.
        <svg width="11" height="11" aria-hidden>
          <defs>
            <pattern
              id="keyHatch"
              patternUnits="userSpaceOnUse"
              width={4}
              height={4}
              patternTransform="rotate(45)"
            >
              <line x1={0} y1={0} x2={0} y2={4} stroke={color} strokeWidth={1.8} />
            </pattern>
          </defs>
          <rect
            x="0.5"
            y="0.5"
            width="10"
            height="10"
            rx="2"
            fill="url(#keyHatch)"
            stroke={color}
            strokeWidth="1"
          />
        </svg>
      ) : bar ? (
        <span
          aria-hidden
          className="h-2.5 w-2.5 rounded-[2px]"
          style={{ background: color }}
        />
      ) : (
        <svg width="22" height="10" aria-hidden>
          <line x1="0" y1="5" x2="22" y2="5" stroke={color} strokeWidth="2" />
          <circle cx="11" cy="5" r="3" fill="#161618" stroke={color} strokeWidth="2" />
        </svg>
      )}
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
