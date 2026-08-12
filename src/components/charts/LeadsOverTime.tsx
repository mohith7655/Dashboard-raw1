import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { LeadDayPoint } from '../../lib/types'
import { formatCompactInteger, formatDay, formatInteger } from '../../lib/format'
import { ChartCard, TooltipCard } from './ChartCard'

interface LeadsOverTimeProps {
  data: LeadDayPoint[]
  unavailable?: string
}

interface TooltipItem {
  payload?: LeadDayPoint
}

const SERIES = [
  { key: 'mailchimp', label: 'Mailchimp', color: '#d4d4d8' },
  { key: 'flodesk', label: 'Flodesk', color: '#a78bfa' },
  { key: 'facebook', label: 'Facebook lead ads', color: '#60a5fa' },
] as const

function LeadTooltip({ active, payload }: { active?: boolean; payload?: TooltipItem[] }) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null

  return (
    <TooltipCard>
      <p className="font-medium">{formatDay(point.date)}</p>
      <div className="mt-1.5 space-y-0.5 tabular-nums">
        {SERIES.map((series) => (
          <p key={series.key}>
            {series.label}: {formatInteger(point[series.key])}
          </p>
        ))}
      </div>
    </TooltipCard>
  )
}

export function LeadsOverTime({ data, unavailable }: LeadsOverTimeProps) {
  return (
    <ChartCard
      title="Leads over time"
      subtitle="Distinct people captured per day, by source"
      height={300}
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
                interval="preserveStartEnd"
                tick={{ fill: '#8a8a92', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: '#262629' }}
                minTickGap={28}
              />
              <YAxis
                tickFormatter={formatCompactInteger}
                tick={{ fill: '#8a8a92', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <Tooltip
                content={<LeadTooltip />}
                cursor={{ stroke: '#4a4a52', strokeWidth: 1 }}
              />
              {SERIES.map((series) => (
                <Line
                  key={series.key}
                  type="monotone"
                  dataKey={series.key}
                  name={series.label}
                  stroke={series.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: series.color, stroke: '#161618', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-2 text-[12px] text-muted">
          {SERIES.map((series) => (
            <span key={series.key} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: series.color }} />
              {series.label}
            </span>
          ))}
        </div>
      </div>
    </ChartCard>
  )
}
