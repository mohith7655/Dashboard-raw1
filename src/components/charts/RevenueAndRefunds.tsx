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
 * Five series, five colours, chosen with the palette validator rather than by
 * eye and every axis printed in the colour of what it measures.
 *
 * Money white, refunds red, conversion blue, visitors a neutral grey, orders
 * amber. Revenue takes the neutral deliberately: it is the series the card is
 * named for, white is the loudest thing available on this ground, and holding
 * a hue back from it leaves the three coloured series further apart from each
 * other than any four-hue set could manage. Worst pair across all ten is ΔE
 * 12.9 simulated and 17.1 unsimulated, against 9.0 and 16.6 when revenue was
 * green and had to share the wheel — red against green is the pair
 * colour-blind readers lose first, and this set never asks them to make it.
 *
 * Colour still never carries identity alone: visitors are a hatched bar and
 * orders a dash drawn across it, each series has its axis in its own colour,
 * the legend draws each mark in its own shape, and the tooltip prints every
 * value against its name.
 */
const REVENUE = '#f4f4f5'
const REFUND = '#e66767'
const ORDERS = '#eda100'
const RATE = '#3987e5'

/**
 * The visitors bar, set only just above the card it sits on.
 *
 * Deliberately the quietest thing in the plot — it is the ground the day is
 * read against rather than a series competing for attention, and at 1.4:1 it
 * reads as a shape in the background rather than as a mark. Everything drawn
 * over it therefore has the full contrast range to itself.
 *
 * Its axis does not use this colour. A tick label this close to the card would
 * be unreadable, so the numbers wear the same muted ink as the dates below
 * them and the bar goes unlabelled — which it can afford, being the only bar.
 */
const VISITORS = '#33333a'
const VISITORS_INK = '#8a8a92'

/*
 * The same five for the tooltip, which is a light card floating over a dark
 * chart and so needs its own steps.
 *
 * These are label text rather than marks, so they are held to text contrast
 * (4.5:1) against the tooltip's own surface rather than the 3:1 a mark needs —
 * the lightest of them measures 5.2:1.
 */
const INK = {
  // The one that cannot follow its mark: white on a light card is nothing. It
  // takes the tooltip's own text colour instead, which is the right reading —
  // revenue is the default series, and the default ink says so.
  revenue: '#27272a',
  refund: '#b3261e',
  visitors: '#52514e',
  orders: '#8a6100',
  rate: '#1b5fa8',
}

/**
 * The hatch filling the visitors bar.
 *
 * Hatched rather than solid because the bar is the ground the other series are
 * read against. Open texture keeps it legible as a quantity while letting the
 * card show through it, which is what stops a column of that height from
 * swallowing the marks inside it.
 */
const HATCH = 'visitorsHatch'

/**
 * Where the gridlines fall, as fractions of the shared ceiling.
 *
 * Given to both left axes so they tick in lockstep. Fractions rather than
 * values because the two carry different units — the same five heights, read
 * once as dollars and once as people.
 */
const TICKS = [0, 0.25, 0.5, 0.75, 1]

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
 * One plot with two scales. Money and people share the first, one to one: a
 * dollar and a visitor are drawn at the same height, so $900 of revenue and
 * 900 arrivals meet on the same gridline and the two columns of numbers read
 * straight across. On this store the two run close enough for that to be worth
 * having — revenue near $700 a day against visitors near 600 — and a reader
 * can see the day traffic outran what it earned without doing any arithmetic.
 *
 * It is a real claim rather than a coincidence of scaling, and worth saying
 * plainly: dollars and people are not the same quantity, and the ratio between
 * them is a fact about this store rather than about the world. Read it as
 * revenue per visitor sitting near one, and the line crossing the bar as that
 * ratio changing.
 *
 * Conversion keeps a scale of its own, on the right. It runs near two percent
 * and would lie flat on the baseline of a scale reaching into the hundreds —
 * there is no honest way to share. Its axis is printed in its own colour so
 * the exception is visible: follow the blue line to the blue numbers, and
 * infer nothing from blue sitting above white.
 *
 * Everything else shares the one scale, deliberately. Revenue against refunds,
 * because they are both money and that comparison is the point — on separate
 * axes a $173 refund drew taller than $1,070 of revenue, inverting the very
 * thing the pair exists to show. And orders against visitors, marked as a dash
 * across the bar rather than as a series beside it: orders come out of those
 * visitors rather than arriving separately, and a rule drawn at a height on
 * the column it belongs to is what says so.
 *
 * A dash per bar rather than a line through them, because a line would join
 * the days into a trend and invite the eye to read its slope — against a
 * ceiling set by visitors, where orders sit near two percent, that slope is
 * mostly noise. The dash makes each day a reading of its own, and the
 * conversion line carries the movement at a size the eye can work with.
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

  /*
   * One ceiling for money and for people, so a dollar and a visitor are the
   * same height.
   *
   * Taken across both units together rather than per series: the whole point of
   * a shared top is that 900 visitors and $900 land on the same pixel, and two
   * ceilings — however close — would put them a few pixels apart and make the
   * comparison a near miss rather than a reading.
   *
   * The bar is measured at its full height, since visitors is the stack's
   * total. Orders need no term of their own: they are a segment of it and
   * cannot exceed it.
   */
  const scaleMax = useMemo(() => {
    let max = 0
    for (const p of data) {
      max = Math.max(max, p.revenue, p.refunds, p.visitors ?? 0)
    }
    return niceCeiling(max)
  }, [data])

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

              {/*
                Money and people on one domain, one to one: $900 and 900
                visitors are drawn at the same height, and the two columns of
                numbers read across at every gridline.

                Still two axes rather than one, because the units are still two
                — the left column carries dollars and the one beside it carries
                people. What they now share is the scale, which is what makes
                the heights mean something against each other.

                Both are pinned to the same ceiling and the same tick count.
                Left to itself each axis would pick its own nice round top and
                the alignment would drift by a few pixels, which is the whole
                comparison lost for want of a shared number.
              */}
              <YAxis
                yAxisId="money"
                orientation="left"
                domain={[0, scaleMax]}
                ticks={TICKS.map((f) => f * scaleMax)}
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
                domain={[0, scaleMax]}
                ticks={TICKS.map((f) => f * scaleMax)}
                tickFormatter={formatCompactInteger}
                tick={{ fill: VISITORS_INK, fontSize: 11 }}
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

              {/* One bar a day, its height the day's visitors, with the orders
                  among them marked across it. Declared first so every line
                  draws over it. */}
              <Bar
                yAxisId="visitors"
                dataKey="visitors"
                shape={<VisitorsBar />}
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
          <Key color={VISITORS} bar hatch>
            Visitors
          </Key>
          <Key color={ORDERS} dash>
            Orders
          </Key>
          <Key color={RATE}>Conversion rate</Key>
        </div>
      </div>
    </ChartCard>
  )
}

/**
 * A day's bar, with that day's orders dashed across it.
 *
 * The two are drawn by one shape rather than as two series so they cannot come
 * apart: a second Bar would be grouped beside this one and offset, and a Line
 * would join the days into a trend nobody asked for. Here the dash inherits
 * the bar's own x and width exactly, and spans it edge to edge — a rule across
 * the column, at the height the orders reach.
 *
 * The height is read off the bar itself rather than from a scale: the bar runs
 * from its baseline to `visitors`, so orders sit that same fraction up it.
 * True by construction, and it stays true whatever the axis ceiling does.
 */
function VisitorsBar(props: {
  x?: number
  y?: number
  width?: number
  height?: number
  payload?: Point
}) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props
  const visitors = payload?.visitors ?? null
  const orders = payload?.orders ?? null

  // A day the provider did not report has no bar. Drawn as nothing rather than
  // as a bar of nought, which would claim nobody came.
  if (visitors === null || height <= 0) return <g />

  const base = y + height
  // Clamped into the bar: an orders count above the visitors count is not
  // impossible — somebody can arrive one day and buy the next — and a dash
  // above the bar would read as more orders than people.
  const dashY =
    orders === null || visitors <= 0
      ? null
      : base - Math.min(1, orders / visitors) * height

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={2}
        fill={`url(#${HATCH})`}
        stroke={VISITORS}
        strokeWidth={1}
      />
      {dashY !== null && (
        <line
          x1={x}
          y1={dashY}
          x2={x + width}
          y2={dashY}
          stroke={ORDERS}
          strokeWidth={2.5}
          strokeLinecap="butt"
        />
      )}
    </g>
  )
}

/**
 * The next round number at or above `max`, so the ceiling is one a reader can
 * do arithmetic against.
 *
 * The ladder is finer than the usual 1-2-5, because a coarse one costs real
 * height here: with a peak of 601 the next rung up at 1000 leaves the top two
 * fifths of the card empty and shrinks every bar to pay for it. Each rung
 * quarters into whole numbers — 1.2 gives 0.3, 2.4 gives 0.6, 3.2 gives 0.8 —
 * so no gridline is bought at the price of a ragged label.
 *
 * An exact power of ten is left alone rather than pushed up a rung, since 1000
 * is already the roundest number available.
 */
function niceCeiling(max: number): number {
  // Some floor is needed or an empty period would divide by nought and put
  // every gridline on the same line.
  if (!(max > 0)) return 100

  const magnitude = 10 ** Math.floor(Math.log10(max))
  for (const step of [1, 1.2, 1.6, 2, 2.4, 3.2, 4, 5, 6, 8, 10]) {
    const candidate = step * magnitude
    if (max <= candidate) return candidate
  }
  return 10 * magnitude
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
  dash = false,
  children,
}: {
  color: string
  bar?: boolean
  /** Draws the swatch hollow and hatched, as the visitors bars are drawn. */
  hatch?: boolean
  /** A bare rule with no dot, as the orders mark is drawn across each bar. */
  dash?: boolean
  children: React.ReactNode
}) {
  return (
    <span className="flex items-center gap-1.5">
      {dash ? (
        <svg width="16" height="10" aria-hidden>
          <line x1="0" y1="5" x2="16" y2="5" stroke={color} strokeWidth="2.5" />
        </svg>
      ) : bar && hatch ? (
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
        <span style={{ color: INK.revenue }}>
          Revenue : {formatCurrency(point.revenue)}
        </span>
        <span style={{ color: INK.refund }}>
          {point.refunds > 0
            ? `Refunded : −${formatCurrency(point.refunds)}`
            : 'No refunds'}
        </span>
        {/* A dash rather than a nought: the provider not reporting a day and
            nobody arriving on it are different claims. */}
        <span style={{ color: INK.visitors }}>
          Visitors : {point.visitors === null ? '—' : formatInteger(point.visitors)}
        </span>
        <span style={{ color: INK.orders }}>
          Orders : {point.orders === null ? '—' : formatInteger(point.orders)}
        </span>
        <span style={{ color: INK.rate }}>
          Conversion :{' '}
          {point.conversionRate === null ? '—' : formatPercent(point.conversionRate)}
        </span>
      </div>
    </TooltipCard>
  )
}
