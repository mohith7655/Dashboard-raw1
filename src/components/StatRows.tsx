import { ArrowDown, ArrowUp } from 'lucide-react'
import type { Polarity } from '../lib/types'
import { formatDeltaPercent, formatPercent } from '../lib/format'

/** A heading figure, or one of the parts that make it up. */
export interface StatRowData {
  label: string
  /** Already formatted — these lists mix currency, counts and ratios. */
  value: string
  kind: 'total' | 'part'
  /** Share of the heading above it, where the parts add up to one. */
  share: number | null
  change: number | null
  /**
   * The same figure over the comparison window, already formatted.
   *
   * A percentage says a direction and a size but not a scale: `+40%` off a base
   * the reader cannot see is unreadable, and on a small base it is noise dressed
   * as news. Printed beside the change rather than in place of it, so the row
   * carries both what moved and what it moved from.
   */
  previous?: string
  /** Which direction reads as good. Defaults to up. */
  polarity?: Polarity
}

function changeColor(change: number, polarity: Polarity): string {
  if (polarity === 'neutral' || change === 0) return 'text-muted'
  const good = polarity === 'down-good' ? change < 0 : change > 0
  return good ? 'text-pos' : 'text-neg'
}

/**
 * The statement's row grammar, shared by the cards that borrow it.
 *
 * Headings sit flush and carry a rule; the parts under them are indented and
 * muted, so the shape reads before any figure does. Columns pack to the left
 * rather than spreading to both edges — across a wide card a figure ends up an
 * inch from the label naming it, and the eye has to cross the gap.
 */
export function StatRows({ rows }: { rows: StatRowData[] }) {
  const anyChange = rows.some((row) => row.change !== null)
  const anyShare = rows.some((row) => row.share !== null)
  // Only when a comparison is actually running. With it off no row carries a
  // baseline, and an empty column would take width from the figures.
  const anyPrevious = rows.some((row) => row.previous !== undefined)

  return (
    // On a narrow screen the rows scroll sideways rather than wrapping a
    // column of figures into unreadable shapes.
    <div className="mt-3 overflow-x-auto border-t border-row-line pt-1">
      <dl
        className={`flex flex-col ${
          anyChange ? 'min-w-[20rem] sm:min-w-[25rem]' : 'min-w-[14.5rem]'
        }`}
      >
        {rows.map((row, index) => (
          <StatRow
            key={`${row.label}-${index}`}
            row={row}
            showChange={anyChange}
            showShare={anyShare}
            showPrevious={anyPrevious}
          />
        ))}
      </dl>
    </div>
  )
}

function StatRow({
  row,
  showChange,
  showShare,
  showPrevious,
}: {
  row: StatRowData
  showChange: boolean
  showShare: boolean
  showPrevious: boolean
}) {
  const total = row.kind === 'total'

  return (
    <div
      className={`flex items-baseline gap-1.5 py-1 ${
        total ? 'border-t border-row-line first:border-0' : ''
      }`}
    >
      {/* Narrow enough that a figure sits close to the words naming it — an
          inch of empty rule between the two makes the eye cross a gap on every
          line. Titled, since a label long enough to truncate is exactly the one
          worth being able to read. */}
      <dt
        title={row.label}
        className={`w-[7.5rem] shrink-0 truncate ${total ? '' : 'pl-2.5'} ${
          total ? 'text-[12px] font-medium text-ink' : 'text-[11px] text-muted'
        }`}
      >
        {row.label}
      </dt>
      <dd className="flex shrink-0 items-baseline gap-1.5">
        {/* A floor rather than a fixed width: the figures line up at the
            magnitudes these lists hold, and an unusually large one widens its
            column instead of being clipped. */}
        <span
          className={`min-w-[4.75rem] text-right tabular-nums ${
            total ? 'text-[12px] font-semibold text-ink' : 'text-[11px] text-muted'
          }`}
        >
          {row.value}
        </span>
        {/* Each column holds its width even where a row has no figure for it,
            so one gap cannot shunt the column beside it out of alignment. */}
        {showShare && (
          <span className="w-11 text-right text-[11px] tabular-nums text-muted">
            {row.share === null ? '' : formatPercent(row.share)}
          </span>
        )}
        {showChange && (
          <span
            className={`flex w-[4rem] items-center justify-end gap-0.5 text-[11px] tabular-nums ${
              row.change === null
                ? 'text-muted'
                : changeColor(row.change, row.polarity ?? 'up-good')
            }`}
          >
            {row.change !== null && (
              <>
                {row.change < 0 ? (
                  <ArrowDown size={10} strokeWidth={3} />
                ) : (
                  <ArrowUp size={10} strokeWidth={3} />
                )}
                {formatDeltaPercent(row.change)}
              </>
            )}
          </span>
        )}
        {/* Quieter than the figure it is a baseline for, and quieter than the
            change: it is context for the two columns before it, not a third
            number competing with them. */}
        {showPrevious && (
          <span className="w-[5rem] shrink-0 text-right text-[11px] tabular-nums text-label">
            {row.previous === undefined ? '' : `vs ${row.previous}`}
          </span>
        )}
      </dd>
    </div>
  )
}
