import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { StatusCount } from '../../lib/types'
import { STATUS_COLORS } from '../../lib/statusColors'
import { formatInteger, formatPercent } from '../../lib/format'
import { ChartCard, TooltipCard } from './ChartCard'

interface OrdersByStatusProps {
  data: StatusCount[]
  loading?: boolean
  unavailable?: string
}

interface SliceTooltipItem {
  payload?: StatusCount & { share?: number }
}

function StatusTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean
  payload?: SliceTooltipItem[]
  total: number
}) {
  const slice = payload?.[0]?.payload
  if (!active || !slice) return null
  return (
    <TooltipCard>
      <div className="font-medium">{slice.status}</div>
      <div className="tabular-nums text-[#5a5a63]">
        {formatInteger(slice.count)} orders · {formatPercent(total ? slice.count / total : 0)}
      </div>
    </TooltipCard>
  )
}

export function OrdersByStatus({ data, loading, unavailable }: OrdersByStatusProps) {
  const total = data.reduce((sum, d) => sum + d.count, 0)

  return (
    <ChartCard
      title="Orders by Status"
      subtitle="All orders in selected period"
      height={300}
      loading={loading}
      unavailable={unavailable}
    >
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="status"
                cx="50%"
                cy="50%"
                outerRadius="92%"
                // A 2px surface-coloured gap keeps adjacent slices legible.
                stroke="#161618"
                strokeWidth={2}
                isAnimationActive={false}
              >
                {data.map((slice) => (
                  <Cell key={slice.status} fill={STATUS_COLORS[slice.status]} />
                ))}
              </Pie>
              <Tooltip content={<StatusTooltip total={total} />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-4 gap-y-1.5 pt-3">
          {data.map((slice) => (
            <span
              key={slice.status}
              className="flex items-center gap-1.5 text-[12px] text-muted"
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-[2px]"
                style={{ background: STATUS_COLORS[slice.status] }}
                aria-hidden
              />
              <span style={{ color: STATUS_COLORS[slice.status] }}>{slice.status}</span>
            </span>
          ))}
        </div>
      </div>
    </ChartCard>
  )
}
