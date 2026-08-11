import type { LucideIcon } from 'lucide-react'
import { StatRows, type StatRowData } from './StatRows'
import { Skeleton } from './Skeleton'

interface RowsCardProps {
  title: string
  /** Sits opposite the title, as it does on every other card. */
  icon: LucideIcon
  rows: StatRowData[]
  loading?: boolean
  /** Rendered in place of the rows when the source failed. */
  unavailable?: string | null
  /** Said under the title, where a figure needs its scope named. */
  subtitle?: string
  /** Shown below the rows — a caveat about how they were struck. */
  footnote?: React.ReactNode
}

/**
 * A card of statement rows under a quiet title.
 *
 * The shape every metric on the dashboard now takes. A grid of KPI tiles put
 * each figure in its own box with its own baseline, which made four numbers
 * read as four unrelated claims and left the eye crossing a card boundary
 * between a figure and the one it should be compared against. Set as rows they
 * share columns — figure, share, change, what it moved from — and a column read
 * down its length is the comparison the tiles could not make.
 */
export function RowsCard({
  title,
  icon: Icon,
  rows,
  loading,
  unavailable,
  subtitle,
  footnote,
}: RowsCardProps) {
  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="kpi-label truncate">{title}</div>
          {subtitle && <p className="mt-1 text-[12px] text-muted">{subtitle}</p>}
        </div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-icon-btn text-muted">
          <Icon size={15} strokeWidth={2} />
        </span>
      </div>

      {loading ? (
        <div className="mt-3 flex flex-col gap-2 border-t border-row-line pt-3">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-full" />
        </div>
      ) : unavailable || rows.length === 0 ? (
        <p className="mt-3 border-t border-row-line pt-3 text-[12px] text-muted">
          {unavailable ?? 'Nothing to report for this period.'}
        </p>
      ) : (
        <>
          <StatRows rows={rows} />
          {footnote}
        </>
      )}
    </div>
  )
}
