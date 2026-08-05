import { ArrowDown, ArrowUp, type LucideIcon } from 'lucide-react'
import type { Metric, Polarity } from '../lib/types'
import { formatDeltaPercent, formatPercent } from '../lib/format'
import { Skeleton } from './Skeleton'

/** One line of the smaller figures under a headline value. */
export interface KpiPart {
  label: string
  /** Already formatted, like `value`. */
  value: string
  /**
   * Share of the headline as a ratio in 0..1, shown at the end of the line.
   * Omitted where a part is not a fraction of the total — gross sales is
   * larger than the revenue below it, and `112%` would read as an error.
   */
  share?: number
  /**
   * This line's own change against the comparison window. Null when there is
   * nothing to compare it against, and the column is then simply blank —
   * a part can lack a baseline the headline has.
   */
  deltaPct?: number | null
}

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
  /**
   * What the headline is made of, in smaller type inside the same card —
   * gross and net under revenue, Meta and Google under total spend.
   *
   * Kept here rather than as sibling cards because these are parts of one
   * figure, and a row of equal-sized cards says they are peers of it.
   */
  parts?: KpiPart[]
}

/** `flat` rather than `up`, because zero has no direction and the arrow beside
 *  it can only point one way or the other. */
const directionWord = (deltaPct: number): string =>
  deltaPct === 0 ? 'flat' : deltaPct > 0 ? 'up' : 'down'

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
  parts,
}: KpiCardProps) {
  const delta = metric?.deltaPct ?? null
  const showParts = !loading && !unavailable && parts && parts.length > 0

  return (
    <div className="card flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="kpi-label truncate">{label}</div>

        {/* Value and change stay on one line, never stacking: the change is a
            property of the figure, and a card that dropped it underneath sat
            taller than its neighbours and read as a different kind of card.
            The value yields first when the two cannot both fit, since a
            clipped figure is still recognisable and a wrapped card is not. */}
        <div className="mt-2 flex items-baseline gap-x-2">
          {loading ? (
            <Skeleton className="h-[30px] w-32" />
          ) : (
            <div className="kpi-value min-w-0 truncate">{unavailable ? '—' : value}</div>
          )}

          {loading ? (
            <Skeleton className="h-3.5 w-28" />
          ) : (
            delta !== null && (
              // The arrow and its colour already carry the direction, so the
              // word that used to follow only made the pair too wide to keep
              // beside the value on a four-column row.
              <div
                className={`flex shrink-0 items-center gap-0.5 text-[12px] ${deltaColor(delta, polarity)}`}
                title={`${formatDeltaPercent(delta)} ${directionWord(delta)}`}
              >
                {delta < 0 ? (
                  <ArrowDown size={13} strokeWidth={2.5} />
                ) : (
                  <ArrowUp size={13} strokeWidth={2.5} />
                )}
                <span className="font-medium tabular-nums">{formatDeltaPercent(delta)}</span>
              </div>
            )
          )}
        </div>

        {showParts && (
          <dl className="mt-3 flex flex-col gap-1.5 border-t border-row-line pt-2.5">
            {parts.map((part) => (
              <div key={part.label} className="flex items-baseline justify-between gap-2">
                <dt className="truncate text-[11px] text-muted">{part.label}</dt>
                <dd className="flex shrink-0 items-baseline gap-2">
                  <span className="text-[12px] font-medium tabular-nums text-ink">
                    {part.value}
                  </span>
                  {/* This period's share reads next to the figure it restates;
                      the move against the comparison window comes after, being
                      about another period.

                      Each column keeps a fixed width so they line up down the
                      card, and holds its space when a line has no figure —
                      otherwise one part without a delta shunts the column
                      beside it out of alignment. */}
                  {part.share !== undefined && (
                    <span className="w-11 text-right text-[11px] tabular-nums text-muted">
                      {formatPercent(part.share)}
                    </span>
                  )}
                  {parts.some((p) => p.deltaPct != null) && (
                    <span
                      className={`w-14 text-right text-[11px] tabular-nums ${
                        part.deltaPct == null
                          ? 'text-muted'
                          : deltaColor(part.deltaPct, polarity)
                      }`}
                    >
                      {part.deltaPct == null
                        ? ''
                        : `${part.deltaPct < 0 ? '↓' : '↑'} ${formatDeltaPercent(part.deltaPct)}`}
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
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
