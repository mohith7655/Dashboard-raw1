import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { WaterfallStep } from '../../lib/pnl'
import { formatAxisCurrency, formatCurrency } from '../../lib/format'
import { ChartCard, TooltipCard } from './ChartCard'

/**
 * A polarity palette, not a categorical one: totals sit on the neutral, every
 * deduction is one colour and every result the other. Each bar also carries a
 * signed direct label, so the reading never rests on colour alone.
 */
const NEUTRAL = '#a1a1aa'
const DEDUCTION = '#ef4444'
const RESULT = '#4ade80'

function stepColor(step: WaterfallStep, isLast: boolean): string {
  if (step.kind === 'decrease') return DEDUCTION
  return isLast ? RESULT : NEUTRAL
}

interface WaterfallTooltipItem {
  payload?: WaterfallStep
}

function StepTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: WaterfallTooltipItem[]
}) {
  const step = payload?.[0]?.payload
  if (!active || !step) return null
  return (
    <TooltipCard>
      <div className="font-medium">{step.label}</div>
      <div className="tabular-nums text-[#5a5a63]">
        {step.kind === 'decrease' ? step.valueLabel : formatCurrency(step.amount)}
      </div>
      {step.kind === 'decrease' && (
        <div className="tabular-nums text-[#5a5a63]">
          Running: {formatCurrency(step.running)}
        </div>
      )}
    </TooltipCard>
  )
}

interface ProfitWaterfallProps {
  steps: WaterfallStep[]
  loading?: boolean
  unavailable?: string
}

export function ProfitWaterfall({ steps, loading, unavailable }: ProfitWaterfallProps) {
  const lastIndex = steps.length - 1

  return (
    <ChartCard
      title="Profit & Loss"
      subtitle="Revenue less each cost, in the order it comes out"
      height={340}
      loading={loading}
      unavailable={unavailable}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={steps} margin={{ top: 24, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid stroke="#232327" vertical={false} />
          <XAxis
            dataKey="label"
            interval={0}
            tick={{ fill: '#8a8a92', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#262629' }}
          />
          <YAxis
            tickFormatter={formatAxisCurrency}
            tick={{ fill: '#8a8a92', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={72}
          />
          <ReferenceLine y={0} stroke="#2c2c30" />
          <Tooltip content={<StepTooltip />} cursor={{ fill: 'rgba(255,255,255,0.035)' }} />
          <Bar dataKey="range" radius={3} barSize={44} isAnimationActive={false}>
            {steps.map((step, i) => (
              // A 2px surface gap keeps neighbouring bars from reading as one mark.
              <Cell
                key={step.label}
                fill={stepColor(step, i === lastIndex)}
                stroke="#161618"
                strokeWidth={2}
              />
            ))}
            <LabelList
              dataKey="valueLabel"
              position="top"
              offset={8}
              fill="#8a8a92"
              fontSize={11}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
