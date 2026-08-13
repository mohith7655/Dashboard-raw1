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
import type { MailchimpBenchmark, MailchimpCampaign } from '../../lib/types'
import { formatCtr, formatDay, formatInteger, formatPercent } from '../../lib/format'
import { ChartCard, TooltipCard } from './ChartCard'

interface EmailEngagementProps {
  /** Sends in the window, most recent first — reversed for the plot. */
  campaigns: MailchimpCampaign[]
  benchmark: MailchimpBenchmark | null
  unavailable?: string
}

/**
 * Open rate and click rate, as two panels rather than two axes.
 *
 * These rates differ by more than an order of magnitude on this account —
 * opens around 11%, clicks around a third of one percent. Plotted together on
 * one scale the click line lies flat on the axis and says nothing; plotted on
 * two scales, the crossings between them would be an artefact of where the
 * axes were set rather than anything in the data. Two panels sharing an
 * x-position is the reading that stays honest.
 */
const BLUE = '#3987e5'
const ORANGE = '#d95926'
const BENCHMARK = '#6e6e76'

interface Point {
  label: string
  title: string
  listName: string
  emailsSent: number
  openRate: number
  clickRate: number
  proxyExcludedOpenRate: number | null
}

export function EmailEngagement({
  campaigns,
  benchmark,
  unavailable,
}: EmailEngagementProps) {
  // Oldest first: the report is ordered newest-first for the table, but a plot
  // reads left to right through time.
  const data: Point[] = [...campaigns].reverse().map((c) => ({
    label: c.sentAt.slice(0, 10),
    title: c.title,
    listName: c.listName,
    emailsSent: c.emailsSent,
    openRate: c.openRate,
    clickRate: c.clickRate,
    proxyExcludedOpenRate: c.proxyExcludedOpenRate,
  }))

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel
        title="Open rate by send"
        subtitle={
          benchmark
            ? `Each campaign in the period. Dashed line is Mailchimp's eCommerce average, ${formatPercent(benchmark.openRate)}.`
            : 'Each campaign in the period.'
        }
        data={data}
        dataKey="openRate"
        color={BLUE}
        format={formatPercent}
        benchmark={benchmark?.openRate ?? null}
        unavailable={unavailable}
      />
      <Panel
        title="Click rate by send"
        subtitle={
          benchmark
            ? `Unique subscriber clicks. Dashed line is the eCommerce average, ${formatCtr(benchmark.clickRate)}.`
            : 'Unique subscriber clicks, as a share of emails delivered.'
        }
        data={data}
        dataKey="clickRate"
        color={ORANGE}
        format={formatCtr}
        benchmark={benchmark?.clickRate ?? null}
        unavailable={unavailable}
      />
    </div>
  )
}

interface PanelProps {
  title: string
  subtitle: string
  data: Point[]
  dataKey: 'openRate' | 'clickRate'
  color: string
  format: (ratio: number) => string
  benchmark: number | null
  unavailable?: string
}

/**
 * One rate over the period's sends.
 *
 * A single series, so it carries no legend — the title names it, and a legend
 * box for one line is furniture.
 */
function Panel({
  title,
  subtitle,
  data,
  dataKey,
  color,
  format,
  benchmark,
  unavailable,
}: PanelProps) {
  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      height={280}
      unavailable={unavailable ?? (data.length === 0 ? 'No sends in this period' : undefined)}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid stroke="#232327" strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="label"
            tickFormatter={formatDay}
            interval="preserveStartEnd"
            tick={{ fill: '#8a8a92', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#262629' }}
            minTickGap={28}
          />
          <YAxis
            tickFormatter={format}
            tick={{ fill: '#8a8a92', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={52}
          />
          {benchmark !== null && (
            <ReferenceLine
              y={benchmark}
              stroke={BENCHMARK}
              strokeDasharray="4 4"
              strokeWidth={1}
            />
          )}
          <Tooltip
            content={<SendTooltip dataKey={dataKey} format={format} />}
            cursor={{ stroke: '#4a4a52', strokeWidth: 1 }}
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            // A send is a discrete event, not a sample of something continuous —
            // the dots are the data, and the line between them only orders it.
            dot={{ r: 4, fill: color, stroke: '#161618', strokeWidth: 2 }}
            activeDot={{ r: 5, fill: color, stroke: '#161618', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

function SendTooltip({
  active,
  payload,
  dataKey,
  format,
}: {
  active?: boolean
  payload?: { payload?: Point }[]
  dataKey: 'openRate' | 'clickRate'
  format: (ratio: number) => string
}) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null

  return (
    <TooltipCard>
      <p className="font-medium">{point.title}</p>
      <p className="mt-0.5 opacity-70">
        {point.listName} · {formatDay(point.label)}
      </p>
      <div className="mt-1.5 space-y-0.5 tabular-nums">
        <p>
          {dataKey === 'openRate' ? 'Open rate' : 'Click rate'}: {format(point[dataKey])}
        </p>
        {/* Only under the opens, where the distinction bites: Apple Mail opens
            every message its users receive, and the gap between these two is
            how much of the rate above was a person. */}
        {dataKey === 'openRate' && point.proxyExcludedOpenRate !== null && (
          <p>Excluding proxy opens: {formatPercent(point.proxyExcludedOpenRate)}</p>
        )}
        <p>Sent to {formatInteger(point.emailsSent)}</p>
      </div>
    </TooltipCard>
  )
}
