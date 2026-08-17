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
import type { RevenuePoint } from '../../lib/types'
import { formatAxisCurrency, formatDay } from '../../lib/format'
import { ChartCard, TooltipCard } from './ChartCard'
import { AVERAGE_DASH, summarise } from '../../lib/chartSummary'
import { ChartSummaryPanel } from './ChartSummary'

const LINE = '#d4d4d8'

interface RevenueOverTimeProps {
  data: RevenuePoint[]
  loading?: boolean
  unavailable?: string
}

interface TooltipPayloadItem {
  value?: number | string
}

function RevenueTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: TooltipPayloadItem[]
}) {
  if (!active || !payload?.length) return null
  const value = Number(payload[0].value ?? 0)
  return (
    <TooltipCard>
      <span className="tabular-nums">Revenue : {formatAxisCurrency(value)}</span>
    </TooltipCard>
  )
}

export function RevenueOverTime({ data, loading, unavailable }: RevenueOverTimeProps) {
  // Every day counts, zeroes included: a day that took nothing took nothing,
  // and dropping it would report the average of the days that traded rather
  // than the average of the period.
  const summary = summarise(data, (point) => point.revenue)

  return (
    <ChartCard
      title="Revenue Over Time"
      subtitle="Daily revenue from completed & processing orders"
      height={340}
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
                // Every other day, so July renders Jul 1, Jul 3, … Jul 31.
                interval={1}
                tick={{ fill: '#8a8a92', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: '#262629' }}
                minTickGap={0}
              />
              <YAxis
                tickFormatter={formatAxisCurrency}
                tick={{ fill: '#8a8a92', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={64}
              />
              <Tooltip
                content={<RevenueTooltip />}
                cursor={{ stroke: '#4a4a52', strokeWidth: 1 }}
              />
              {/* Under the series, so the data crosses over the reference
                  rather than the reference over the data. */}
              {summary && (
                <ReferenceLine
                  y={summary.average}
                  stroke={LINE}
                  strokeDasharray={AVERAGE_DASH}
                  strokeLinecap="round"
                  strokeWidth={2.5}
                  ifOverflow="extendDomain"
                />
              )}
              <Line
                type="monotone"
                dataKey="revenue"
                stroke={LINE}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: LINE, stroke: '#161618', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <ChartSummaryPanel summary={summary} format={formatAxisCurrency} />
        </div>

        <div className="flex shrink-0 items-center justify-center gap-4 pt-2 text-[12px] text-muted">
          <span className="flex items-center gap-2">
            <svg width="26" height="10" aria-hidden>
              <line x1="0" y1="5" x2="26" y2="5" stroke={LINE} strokeWidth="2" />
              <circle cx="13" cy="5" r="3.5" fill="#161618" stroke={LINE} strokeWidth="2" />
            </svg>
            Revenue
          </span>
          {summary && (
            <span className="flex items-center gap-2">
              <svg width="26" height="10" aria-hidden>
                <line
                  x1="1"
                  y1="5"
                  x2="25"
                  y2="5"
                  stroke={LINE}
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
