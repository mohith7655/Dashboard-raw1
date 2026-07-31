import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { RevenuePoint } from '../../lib/types'
import { formatAxisCurrency, formatDay } from '../../lib/format'
import { ChartCard, TooltipCard } from './ChartCard'

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
  return (
    <ChartCard
      title="Revenue Over Time"
      subtitle="Daily revenue from completed & processing orders"
      height={340}
      loading={loading}
      unavailable={unavailable}
    >
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1">
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

        <div className="flex shrink-0 items-center justify-center gap-2 pt-2 text-[12px] text-muted">
          <svg width="26" height="10" aria-hidden>
            <line x1="0" y1="5" x2="26" y2="5" stroke={LINE} strokeWidth="2" />
            <circle cx="13" cy="5" r="3.5" fill="#161618" stroke={LINE} strokeWidth="2" />
          </svg>
          Revenue
        </div>
      </div>
    </ChartCard>
  )
}
