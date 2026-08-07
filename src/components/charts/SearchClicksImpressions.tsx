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
import { formatCompactInteger, formatDay, formatInteger } from '../../lib/format'
import { ChartCard, TooltipCard } from './ChartCard'

const CLICKS = '#d4d4d8'
const IMPRESSIONS = '#6c8cf0'
const FILL = 'impressionsArea'

interface SearchClicksImpressionsProps {
  data: { date: string; clicks: number; impressions: number }[]
  loading?: boolean
  unavailable?: string
  /** The last day with data, named in the subtitle so the tail is not misread. */
  freshestDate?: string | null
}

interface TooltipPayloadItem {
  dataKey?: string | number
  value?: number | string
}

function SearchTooltip({
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
  const impressions = read('impressions')
  const clicks = read('clicks')

  return (
    <TooltipCard>
      <div className="flex flex-col gap-0.5 tabular-nums">
        {label && <span className="font-medium">{formatDay(label)}</span>}
        <span>Clicks : {formatInteger(clicks)}</span>
        <span style={{ color: '#3b5bc0' }}>
          Impressions : {formatInteger(impressions)}
        </span>
        {/* The rate the two produce, rather than leaving the reader to divide
            one by the other in their head. */}
        <span>CTR : {impressions ? ((clicks / impressions) * 100).toFixed(2) : '0.00'}%</span>
      </div>
    </TooltipCard>
  )
}

/**
 * Two scales here, unlike the revenue plot.
 *
 * Revenue and refunds share an axis because the comparison between them is the
 * point. These two are not comparable in that way — impressions outnumber
 * clicks by twenty or fifty to one, and on one scale the click line lies flat
 * along the axis and shows nothing at all. What matters is whether the two
 * shapes move together: impressions rising while clicks stay flat is a ranking
 * or a listing problem, and it is only visible when both curves have room.
 */
export function SearchClicksImpressions({
  data,
  loading,
  unavailable,
  freshestDate,
}: SearchClicksImpressionsProps) {
  const clicks = data.reduce((sum, point) => sum + point.clicks, 0)
  const impressions = data.reduce((sum, point) => sum + point.impressions, 0)

  return (
    <ChartCard
      title="Organic Clicks and Impressions"
      subtitle={
        data.length
          ? `${formatCompactInteger(clicks)} clicks from ${formatCompactInteger(
              impressions,
            )} impressions — separate scales, so both shapes are readable` +
            (freshestDate ? `. Search Console has data through ${formatDay(freshestDate)}` : '')
          : 'Daily organic clicks and impressions from Search Console'
      }
      height={340}
      loading={loading}
      unavailable={unavailable}
    >
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
              <defs>
                <linearGradient id={FILL} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={IMPRESSIONS} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={IMPRESSIONS} stopOpacity={0.02} />
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

              <YAxis
                yAxisId="clicks"
                tickFormatter={formatCompactInteger}
                tick={{ fill: '#8a8a92', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={52}
              />
              <YAxis
                yAxisId="impressions"
                orientation="right"
                tickFormatter={formatCompactInteger}
                tick={{ fill: '#6f7f9a', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={52}
              />

              <Tooltip
                content={<SearchTooltip />}
                cursor={{ stroke: '#4a4a52', strokeWidth: 1 }}
              />

              {/* Impressions first, so the fill sits behind the click line. */}
              <Area
                yAxisId="impressions"
                type="monotone"
                dataKey="impressions"
                stroke={IMPRESSIONS}
                strokeWidth={2}
                fill={`url(#${FILL})`}
                dot={false}
                activeDot={{ r: 4, fill: IMPRESSIONS, stroke: '#161618', strokeWidth: 2 }}
                isAnimationActive={false}
              />
              <Line
                yAxisId="clicks"
                type="monotone"
                dataKey="clicks"
                stroke={CLICKS}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: CLICKS, stroke: '#161618', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-5 gap-y-1 pt-2 text-[12px] text-muted">
          <span className="flex items-center gap-2">
            <svg width="26" height="10" aria-hidden>
              <line x1="0" y1="5" x2="26" y2="5" stroke={CLICKS} strokeWidth="2" />
              <circle cx="13" cy="5" r="3.5" fill="#161618" stroke={CLICKS} strokeWidth="2" />
            </svg>
            Clicks (left)
          </span>
          <span className="flex items-center gap-2">
            <svg width="26" height="10" aria-hidden>
              <line x1="0" y1="5" x2="26" y2="5" stroke={IMPRESSIONS} strokeWidth="2" />
              <circle
                cx="13"
                cy="5"
                r="3.5"
                fill="#161618"
                stroke={IMPRESSIONS}
                strokeWidth="2"
              />
            </svg>
            Impressions (right)
          </span>
        </div>
      </div>
    </ChartCard>
  )
}
