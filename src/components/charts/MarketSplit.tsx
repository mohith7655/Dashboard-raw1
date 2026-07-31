import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { MarketRevenue } from '../../lib/types'
import {
  formatAxisCurrency,
  formatCurrency,
  formatInteger,
  formatPercent,
} from '../../lib/format'
import { ChartCard, TooltipCard } from './ChartCard'

/** One series, so one recessive tone — identity comes from the axis labels. */
const BAR = '#a1a1aa'
const TOP_N = 8
const ROW_HEIGHT = 30
const CHROME = 56

interface MarketRow extends MarketRevenue {
  /** Share of the period's revenue, 0..1. */
  share: number
}

/** Top N by revenue; the tail collapses into one row rather than being dropped. */
function collapse(rows: MarketRevenue[], total: number): MarketRow[] {
  const sorted = [...rows].sort((a, b) => b.revenue - a.revenue)
  const top = sorted.slice(0, TOP_N)
  const rest = sorted.slice(TOP_N)

  const withShare = (row: MarketRevenue): MarketRow => ({
    ...row,
    share: total === 0 ? 0 : row.revenue / total,
  })

  if (rest.length === 0) return top.map(withShare)

  const other = rest.reduce(
    (acc, row) => ({
      key: `other (${rest.length})`,
      orders: acc.orders + row.orders,
      revenue: Math.round((acc.revenue + row.revenue) * 100) / 100,
    }),
    { key: '', orders: 0, revenue: 0 },
  )
  return [...top, other].map(withShare)
}

interface MarketTooltipItem {
  payload?: MarketRow
}

function MarketTooltip({
  active,
  payload,
  noun,
}: {
  active?: boolean
  payload?: MarketTooltipItem[]
  noun: string
}) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  return (
    <TooltipCard>
      <div className="font-medium">{row.key}</div>
      <div className="tabular-nums text-[#5a5a63]">{formatCurrency(row.revenue)}</div>
      <div className="tabular-nums text-[#5a5a63]">
        {formatInteger(row.orders)} orders · {formatPercent(row.share)} of revenue
      </div>
      <div className="mt-1 text-[11px] text-[#5a5a63]">Converted to store {noun}</div>
    </TooltipCard>
  )
}

interface MarketSplitProps {
  title: string
  subtitle: string
  rows: MarketRevenue[]
  /** Period revenue, used for the share figure in the tooltip. */
  total: number
  loading?: boolean
  unavailable?: string
}

export function MarketSplit({
  title,
  subtitle,
  rows,
  total,
  loading,
  unavailable,
}: MarketSplitProps) {
  const data = collapse(rows, total)
  const empty = !loading && !unavailable && data.length === 0

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      height={Math.max(data.length, 5) * ROW_HEIGHT + CHROME}
      loading={loading}
      unavailable={unavailable ?? (empty ? 'No orders in this period.' : undefined)}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 88, bottom: 4, left: 8 }}>
          <CartesianGrid stroke="#232327" horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={formatAxisCurrency}
            tick={{ fill: '#8a8a92', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#262629' }}
          />
          <YAxis
            type="category"
            dataKey="key"
            interval={0}
            tick={{ fill: '#8a8a92', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={96}
          />
          <Tooltip
            content={<MarketTooltip noun="currency" />}
            cursor={{ fill: 'rgba(255,255,255,0.035)' }}
          />
          <Bar
            dataKey="revenue"
            fill={BAR}
            radius={[0, 3, 3, 0]}
            barSize={14}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
