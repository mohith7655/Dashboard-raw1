import { ArrowDown, ArrowUp } from 'lucide-react'
import type { Polarity } from '../lib/types'
import { formatDeltaPercent } from '../lib/format'

export interface FigureBoxData {
  label: string
  /** Already formatted — these boxes mix currency, counts and ratios. */
  value: string
  /** Percentage against the comparison window, or null where there is none. */
  change: number | null
  /** The same figure over that window, already formatted. */
  previous?: string
  /** The move in the figure's own unit, already formatted and signed. */
  difference?: string
  /** Which direction reads as good. Defaults to up. */
  polarity?: Polarity
  /** Said under the figures where one needs its scope named. */
  note?: string
}

/**
 * One boxed figure, in the grammar every headline on the dashboard uses.
 *
 * Two lines under the label: the figure with its percentage, then the pair
 * that percentage is made from — what it was, and how far it moved. The same
 * shape the CEO statement, the ad spend card and the email strip all draw, and
 * the reason this exists: five cards had each grown their own copy of it, and
 * a sixth would have been the one that quietly drifted.
 */
export function FigureBox({
  label,
  value,
  change,
  previous,
  difference,
  polarity = 'up-good',
  note,
}: FigureBoxData) {
  return (
    <div className="min-w-0 rounded-lg border border-btn-border px-3 py-2.5">
      <div className="truncate text-[10.5px] uppercase tracking-wide text-label">
        {label}
      </div>

      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="truncate text-[24px] font-semibold leading-tight tabular-nums text-ink">
          {value}
        </span>
        {change !== null && (
          <span
            className={`flex items-center gap-0.5 text-[11px] tabular-nums ${changeColor(
              change,
              polarity,
            )}`}
          >
            {change < 0 ? (
              <ArrowDown size={10} strokeWidth={3} />
            ) : (
              <ArrowUp size={10} strokeWidth={3} />
            )}
            {formatDeltaPercent(change)}
          </span>
        )}
      </div>

      {(previous !== undefined || difference !== undefined) && (
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[11px] tabular-nums">
          {previous !== undefined && <span className="text-label">{previous}</span>}
          {difference !== undefined && (
            <span className="text-[#5a5a62]">{difference}</span>
          )}
        </div>
      )}

      {note && <div className="mt-0.5 truncate text-[11px] text-label">{note}</div>}
    </div>
  )
}

function changeColor(change: number, polarity: Polarity): string {
  if (polarity === 'neutral' || change === 0) return 'text-muted'
  const good = polarity === 'down-good' ? change < 0 : change > 0
  return good ? 'text-pos' : 'text-neg'
}
