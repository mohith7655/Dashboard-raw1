import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { RefundPoint } from '../../lib/types'
import { formatAxisCurrency, formatCurrency, formatDay } from '../../lib/format'
import { ChartCard, TooltipCard } from './ChartCard'

/** The statement's own colour for money going the wrong way. */
const LINE = '#ef6f66'
const FILL = 'refundsFill'

interface RefundsOverTimeProps {
  data: RefundPoint[]
  loading?: boolean
  unavailable?: string
}

interface TooltipPayloadItem {
  value?: number | string
}

function RefundTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const value = Number(payload[0].value ?? 0)
  return (
    <TooltipCard>
      <span className="tabular-nums">
        {/* Named rather than left to the colour: on a day with nothing
            returned, a bare figure of zero says less than the word does. */}
        {value > 0 ? `Refunded : −${formatCurrency(value)}` : 'Nothing refunded'}
        {label ? ` · ${formatDay(label)}` : ''}
      </span>
    </TooltipCard>
  )
}

/**
 * What went back, day by day.
 *
 * An area rather than a line, and a separate card rather than a second series
 * on the revenue chart. Refunds are sparse — most days are zero and a few
 * carry the lot — so plotted against revenue they would sit flat on the axis
 * and read as though nothing ever went back. On their own scale the spikes are
 * the point, and the area makes a single day's bar visible where a line
 * between two zeroes would nearly vanish.
 */
export function RefundsOverTime({ data, loading, unavailable }: RefundsOverTimeProps) {
  const total = data.reduce((sum, point) => sum + point.refunds, 0)
  const days = data.filter((point) => point.refunds > 0).length

  return (
    <ChartCard
      title="Refunds Over Time"
      subtitle={
        total > 0
          ? `${formatCurrency(total)} returned across ${days} ${
              days === 1 ? 'day' : 'days'
            }, on the date each refund was issued`
          : 'Nothing was refunded in this period'
      }
      height={340}
      loading={loading}
      unavailable={unavailable}
    >
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
              <defs>
                <linearGradient id={FILL} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={LINE} stopOpacity={0.32} />
                  <stop offset="100%" stopColor={LINE} stopOpacity={0.02} />
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
              <YAxis
                tickFormatter={formatAxisCurrency}
                tick={{ fill: '#8a8a92', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={64}
                // A period with no refunds still draws a real axis rather than
                // collapsing to a single zero line with no scale on it.
                domain={[0, (max: number) => (max > 0 ? max : 100)]}
              />
              <Tooltip
                content={<RefundTooltip />}
                cursor={{ stroke: '#4a4a52', strokeWidth: 1 }}
              />
              <Area
                type="monotone"
                dataKey="refunds"
                stroke={LINE}
                strokeWidth={2}
                fill={`url(#${FILL})`}
                // Shown on a day that carries one, so a lone refund between two
                // empty days is a visible point rather than a hairline spike.
                dot={(props: { cx?: number; cy?: number; payload?: RefundPoint }) => {
                  const { cx, cy, payload } = props
                  if (!payload || payload.refunds <= 0 || cx === undefined || cy === undefined) {
                    return <g />
                  }
                  return <circle cx={cx} cy={cy} r={2.5} fill={LINE} />
                }}
                activeDot={{ r: 4, fill: LINE, stroke: '#161618', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="flex shrink-0 items-center justify-center gap-2 pt-2 text-[12px] text-muted">
          <svg width="26" height="10" aria-hidden>
            <line x1="0" y1="5" x2="26" y2="5" stroke={LINE} strokeWidth="2" />
            <circle cx="13" cy="5" r="3.5" fill="#161618" stroke={LINE} strokeWidth="2" />
          </svg>
          Refunded
        </div>
      </div>
    </ChartCard>
  )
}
