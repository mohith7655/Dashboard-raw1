import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { SourceRevenue } from '../../lib/types'
import { formatAxisCurrency, formatCurrency } from '../../lib/format'
import { ChartCard, TooltipCard } from './ChartCard'

const BAR = '#a1a1aa'
const TOP_N = 7

interface RevenueByTrafficSourceProps {
  data: SourceRevenue[]
  loading?: boolean
  unavailable?: string
}

/** Top 7 sources by revenue; everything else collapses into a single `other`. */
function collapseToTop(data: SourceRevenue[], topN = TOP_N): SourceRevenue[] {
  const sorted = [...data].sort((a, b) => b.revenue - a.revenue)
  const top = sorted.slice(0, topN)
  const rest = sorted.slice(topN)
  if (rest.length === 0) return top
  const other = rest.reduce((sum, d) => sum + d.revenue, 0)
  return [...top, { source: 'other', revenue: Math.round(other * 100) / 100 }]
}

interface BarTooltipItem {
  payload?: SourceRevenue
}

function SourceTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: BarTooltipItem[]
}) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  return (
    <TooltipCard>
      <div className="font-medium">{row.source}</div>
      <div className="tabular-nums text-[#5a5a63]">{formatCurrency(row.revenue)}</div>
    </TooltipCard>
  )
}

export function RevenueByTrafficSource({
  data,
  loading,
  unavailable,
}: RevenueByTrafficSourceProps) {
  const rows = collapseToTop(data)

  return (
    <ChartCard
      title="Revenue by Traffic Source"
      subtitle="Top UTM sources (paid orders only)"
      height={300}
      loading={loading}
      unavailable={unavailable}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
        >
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
            dataKey="source"
            tick={{ fill: '#8a8a92', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={100}
          />
          <Tooltip content={<SourceTooltip />} cursor={{ fill: 'rgba(255,255,255,0.035)' }} />
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
