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
 * A polarity palette, not a categorical one: totals sit on the neutral, money
 * out takes one pole and money in the other. Every bar also carries a signed
 * direct label, so the reading never rests on colour alone.
 */
const NEUTRAL = '#a1a1aa'
const OUT = '#ef4444'
const IN = '#4ade80'

function stepColor(step: WaterfallStep, isLast: boolean): string {
  if (step.kind === 'decrease') return OUT
  if (step.kind === 'increase') return IN
  return isLast ? IN : NEUTRAL
}

/** 30px a row keeps the labels off each other however long the statement gets. */
const ROW_HEIGHT = 30
const CHROME = 56

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
      <div className="tabular-nums text-[#5a5a63]">{step.valueLabel}</div>
      {step.kind !== 'total' && (
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
      subtitle="Gross sales through every discount and cost, in the order it comes off"
      height={Math.max(steps.length, 6) * ROW_HEIGHT + CHROME}
      loading={loading}
      unavailable={unavailable}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={steps}
          layout="vertical"
          margin={{ top: 4, right: 96, bottom: 4, left: 8 }}
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
            dataKey="label"
            interval={0}
            tick={{ fill: '#8a8a92', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={116}
          />
          <ReferenceLine x={0} stroke="#2c2c30" />
          <Tooltip content={<StepTooltip />} cursor={{ fill: 'rgba(255,255,255,0.035)' }} />
          <Bar dataKey="range" radius={3} barSize={16} isAnimationActive={false}>
            {steps.map((step, i) => (
              // A 2px surface ring keeps neighbouring bars reading as separate marks.
              <Cell
                key={step.label}
                fill={stepColor(step, i === lastIndex)}
                stroke="#161618"
                strokeWidth={2}
              />
            ))}
            <LabelList
              dataKey="valueLabel"
              position="right"
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
