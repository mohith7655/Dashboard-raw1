import type { LucideIcon } from 'lucide-react'
import type { Metric, Polarity } from '../lib/types'
import { KpiCard } from './KpiCard'

export interface KpiSpec {
  label: string
  metric: Metric | undefined
  format: (value: number) => string
  icon: LucideIcon
  polarity?: Polarity
}

interface KpiGridProps {
  items: KpiSpec[]
  loading?: boolean
  failed?: boolean
  /** Columns at the lg breakpoint. Below that: 2 then 1. */
  columns?: 3 | 4
}

/** The four-across KPI strip that opens most pages. */
export function KpiGrid({
  items,
  loading,
  failed,
  columns = 4,
}: KpiGridProps) {
  const cols = columns === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'
  return (
    <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${cols}`}>
      {items.map((item) => (
        <KpiCard
          key={item.label}
          label={item.label}
          value={item.metric ? item.format(item.metric.value) : '—'}
          metric={item.metric}
          icon={item.icon}
          polarity={item.polarity}
          loading={loading}
          unavailable={failed}
        />
      ))}
    </div>
  )
}
