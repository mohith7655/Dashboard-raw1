import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TrafficPoint } from '../../lib/types'
import {
  formatCompactInteger,
  formatDay,
  formatInteger,
  formatPercent,
} from '../../lib/format'
import { ChartCard, TooltipCard } from './ChartCard'
import { AVERAGE_DASH, summarise } from '../../lib/chartSummary'
import { ChartSummaryPanel } from './ChartSummary'

/**
 * Visitors and conversion rate are deliberately two charts rather than one with
 * two axes: a count and a rate share no scale, and pairing them on a dual axis
 * lets the reader infer a crossover that is an artefact of where the axes were
 * pinned. Side by side over the same dates, the comparison is still immediate
 * and nothing is implied that the data does not say.
 */

/** Matches the neutral stroke the revenue chart uses for a single series. */
const COUNT_LINE = '#d4d4d8'
/** A rate is a different kind of measure, so it reads in its own hue. */
const RATE_LINE = '#7dd3fc'

interface TrafficChartProps {
  data: TrafficPoint[]
  loading?: boolean
  unavailable?: string
}

interface TooltipPayloadItem {
  value?: number | string
  payload?: TrafficPoint
}

interface SeriesSpec {
  title: string
  subtitle: string
  dataKey: 'visitors' | 'conversionRate'
  color: string
  legend: string
  axisFormat: (n: number) => string
  /** Full-precision wording for the tooltip. */
  readout: (point: TrafficPoint) => string
  axisWidth: number
  /** How the side panel prints a figure, where the axis is too terse for it. */
  summaryFormat: (n: number) => string
  /** Which points the average is struck from; see `summarise`. */
  counts?: (point: TrafficPoint) => boolean
}

function TrafficChart({
  data,
  loading,
  unavailable,
  spec,
}: TrafficChartProps & { spec: SeriesSpec }) {
  function SeriesTooltip({
    active,
    payload,
  }: {
    active?: boolean
    payload?: TooltipPayloadItem[]
  }) {
    const point = payload?.[0]?.payload
    if (!active || !point) return null
    return (
      <TooltipCard>
        <span className="tabular-nums">{spec.readout(point)}</span>
      </TooltipCard>
    )
  }

  const summary = summarise(data, (point) => point[spec.dataKey], spec.counts)

  return (
    <ChartCard
      title={spec.title}
      subtitle={spec.subtitle}
      height={280}
      loading={loading}
      unavailable={unavailable}
    >
      <div className="flex h-full flex-col">
        <div className="flex min-h-0 flex-1 gap-3">
        <div className="min-w-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
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
              <YAxis
                tickFormatter={spec.axisFormat}
                tick={{ fill: '#8a8a92', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={spec.axisWidth}
              />
              <Tooltip
                content={<SeriesTooltip />}
                cursor={{ stroke: '#4a4a52', strokeWidth: 1 }}
              />
              {/* Under the series, so the data crosses over the reference
                  rather than the reference over the data. */}
              {summary && (
                <ReferenceLine
                  y={summary.average}
                  stroke={spec.color}
                  strokeDasharray={AVERAGE_DASH}
                  strokeLinecap="round"
                  strokeWidth={2.5}
                  ifOverflow="extendDomain"
                />
              )}
              <Line
                type="monotone"
                dataKey={spec.dataKey}
                stroke={spec.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: spec.color, stroke: '#161618', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <ChartSummaryPanel summary={summary} format={spec.summaryFormat} />
        </div>

        <div className="flex shrink-0 items-center justify-center gap-4 pt-2 text-[12px] text-muted">
          <span className="flex items-center gap-2">
            <svg width="26" height="10" aria-hidden>
              <line x1="0" y1="5" x2="26" y2="5" stroke={spec.color} strokeWidth="2" />
              <circle cx="13" cy="5" r="3.5" fill="#161618" stroke={spec.color} strokeWidth="2" />
            </svg>
            {spec.legend}
          </span>
          {summary && (
            <span className="flex items-center gap-2">
              <svg width="26" height="10" aria-hidden>
                <line
                  x1="1"
                  y1="5"
                  x2="25"
                  y2="5"
                  stroke={spec.color}
                  strokeWidth="2.5"
                  strokeDasharray={AVERAGE_DASH}
                  strokeLinecap="round"
                />
              </svg>
              Average
            </span>
          )}
        </div>
      </div>
    </ChartCard>
  )
}

export function VisitorsOverTime(props: TrafficChartProps) {
  return (
    <TrafficChart
      {...props}
      spec={{
        title: 'Visitors Over Time',
        subtitle: 'Unique visitors per day, as the analytics provider counts them',
        dataKey: 'visitors',
        color: COUNT_LINE,
        legend: 'Visitors',
        axisFormat: formatCompactInteger,
        axisWidth: 48,
        // The axis abbreviates to fit; the panel has room for the whole figure.
        summaryFormat: formatInteger,
        readout: (p) => `Visitors : ${formatInteger(p.visitors)}`,
      }}
    />
  )
}

export function ConversionRateOverTime(props: TrafficChartProps) {
  return (
    <TrafficChart
      {...props}
      spec={{
        title: 'Conversion Rate Over Time',
        subtitle: 'Orders as a share of visitors, per day',
        dataKey: 'conversionRate',
        color: RATE_LINE,
        legend: 'Conversion rate',
        axisFormat: formatPercent,
        axisWidth: 56,
        summaryFormat: formatPercent,
        // A day nobody visited has no conversion rate — not a rate of zero.
        // Counting those days as zeroes would pull the average toward a figure
        // no day on the chart recorded, and would hand the "low" to a day that
        // never had the chance to convert anyone.
        counts: (p) => p.visitors > 0,
        readout: (p) =>
          `${formatPercent(p.conversionRate)} — ${formatInteger(p.orders)} of ${formatInteger(p.visitors)}`,
      }}
    />
  )
}
