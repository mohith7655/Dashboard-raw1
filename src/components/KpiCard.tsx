import { ArrowDown, ArrowUp, type LucideIcon } from 'lucide-react'
import type { Metric, Polarity } from '../lib/types'
import { formatDeltaPercent } from '../lib/format'
import { Skeleton } from './Skeleton'

interface KpiCardProps {
  label: string
  /** Already-formatted value, e.g. `$22,375.66`. */
  value: string
  icon: LucideIcon
  metric?: Metric
  /** Which direction of change should read as good. Defaults to up. */
  polarity?: Polarity
  loading?: boolean
  /** Renders an em-dash placeholder instead of a value. */
  unavailable?: boolean
}

function deltaColor(deltaPct: number, polarity: Polarity): string {
  if (polarity === 'neutral' || deltaPct === 0) return 'text-muted'
  const good = polarity === 'down-good' ? deltaPct < 0 : deltaPct > 0
  return good ? 'text-pos' : 'text-neg'
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  metric,
  polarity = 'up-good',
  loading = false,
  unavailable = false,
}: KpiCardProps) {
  const delta = metric?.deltaPct ?? null

  return (
    <div className="card flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="kpi-label truncate">{label}</div>

        {loading ? (
          <Skeleton className="mt-2.5 h-[30px] w-32" />
        ) : (
          <div className="kpi-value mt-2 truncate">{unavailable ? '—' : value}</div>
        )}

        {loading ? (
          <Skeleton className="mt-3 h-3.5 w-40" />
        ) : delta !== null ? (
          <div className="mt-2.5 flex items-center gap-1 text-[12px]">
            {delta < 0 ? (
              <ArrowDown size={13} className={deltaColor(delta, polarity)} strokeWidth={2.5} />
            ) : (
              <ArrowUp size={13} className={deltaColor(delta, polarity)} strokeWidth={2.5} />
            )}
            <span className={`font-medium tabular-nums ${deltaColor(delta, polarity)}`}>
              {formatDeltaPercent(delta)}
            </span>
            <span className="text-muted">vs prev period</span>
          </div>
        ) : (
          <div className="mt-2.5 h-[18px]" />
        )}
      </div>

      <button
        type="button"
        aria-label={`${label} options`}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-icon-btn text-muted transition-colors hover:text-ink"
      >
        <Icon size={15} strokeWidth={2} />
      </button>
    </div>
  )
}
