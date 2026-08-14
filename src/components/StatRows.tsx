import type { Polarity } from '../lib/types'
import { formatPercent } from '../lib/format'

/** A heading figure, or one of the parts that make it up. */
export interface StatRowData {
  label: string
  /** Already formatted — these lists mix currency, counts and ratios. */
  value: string
  kind: 'total' | 'part'
  /** Share of the heading above it, where the parts add up to one. */
  share: number | null
  /**
   * Retained on the type but no longer drawn — see the note on `StatRows`. The
   * rows state the move in the figure's own units instead.
   */
  change: number | null
  /**
   * The same figure over the comparison window, already formatted.
   *
   * This is what a row is actually read against, so it sits in the column the
   * percentage used to hold rather than in small print underneath it.
   */
  previous?: string
  /**
   * The move from that baseline, signed and in the figure's own units.
   *
   * The pair replaces the percentage. `+40%` off a base the reader cannot see
   * is unreadable, and on a small base it is noise dressed as news — `130 → 91`
   * says at a glance what `−30.0%` needed a second figure to explain. Struck
   * from the two numbers beside it, never recovered from a percentage.
   */
  difference?: string
  /** Which direction reads as good. Defaults to up. */
  polarity?: Polarity
}

/**
 * The ink a move is set in, read off its own sign.
 *
 * `formatDifference` writes `+`, `−` (U+2212) or `±` for no change, so the
 * string carries its direction and there is no second number to consult. A
 * move of nothing stays neutral whatever the polarity — it went nowhere, which
 * is neither good nor bad.
 */
function moveColor(difference: string, polarity: Polarity): string {
  if (polarity === 'neutral' || difference.startsWith('±')) return 'text-muted'
  const rose = difference.startsWith('+')
  const good = polarity === 'down-good' ? !rose : rose
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
  const anyShare = rows.some((row) => row.share !== null)
  // Only when a comparison is actually running. With it off no row carries a
  // baseline, and two empty columns would take width from the figures.
  const anyPrevious = rows.some((row) => row.previous !== undefined)
  const anyDifference = rows.some((row) => row.difference !== undefined)

  return (
    // On a narrow screen the rows scroll sideways rather than wrapping a
    // column of figures into unreadable shapes.
    <div className="mt-3 overflow-x-auto border-t border-row-line pt-1">
      {/* Narrower than it was by the width of the baseline column, which has
          gone under the figure instead of beside it. That column was what
          pushed a statement row past the width of a phone and turned this into
          a real horizontal scroller nested in a vertical page. */}
      <dl
        className={`flex flex-col ${
          anyPrevious ? 'min-w-[21rem]' : 'min-w-[14.5rem]'
        }`}
      >
        {rows.map((row, index) => (
          <StatRow
            key={`${row.label}-${index}`}
            row={row}
            showShare={anyShare}
            showPrevious={anyPrevious}
            showDifference={anyDifference}
          />
        ))}
      </dl>
    </div>
  )
}

function StatRow({
  row,
  showShare,
  showPrevious,
  showDifference,
}: {
  row: StatRowData
  showShare: boolean
  showPrevious: boolean
  showDifference: boolean
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
      {/* One line, and the comparison reads left to right: the figure, then
          what it was, then the move between them. The baseline used to sit in
          small print underneath and the percentage in the column now holding
          the move — which meant the two numbers a row exists to compare were
          on different lines, and the number bridging them was a proportion the
          reader had to translate back into the unit they were reading. */}
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
        {showPrevious && (
          <span className="w-[4.75rem] text-right text-[11px] tabular-nums text-label">
            {row.previous ?? ''}
          </span>
        )}
        {showDifference && (
          <span
            className={`w-[4.5rem] text-right text-[11px] tabular-nums ${
              row.difference === undefined
                ? 'text-muted'
                : moveColor(row.difference, row.polarity ?? 'up-good')
            }`}
          >
            {row.difference ?? ''}
          </span>
        )}
      </dd>
    </div>
  )
}
