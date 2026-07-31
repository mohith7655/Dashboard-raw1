import type { CostSlice } from '../../lib/pnl'
import { formatCurrency, formatPercent } from '../../lib/format'
import { Skeleton } from '../Skeleton'

/**
 * Categorical slots 1–3, validated against this card surface for all pairs in
 * both normal and CVD vision. Colour keys the segment to its legend row; the
 * row carries the label and the number, so colour is never load-bearing.
 */
const SLICE_COLORS = ['#3987e5', '#d95926', '#199e70']

interface CostMixProps {
  slices: CostSlice[]
  total: number
  loading?: boolean
  unavailable?: string
}

export function CostMix({ slices, total, loading, unavailable }: CostMixProps) {
  const hasCost = total > 0 && slices.some((s) => s.amount > 0)

  return (
    <div className="card">
      <h3 className="text-[15px] font-semibold text-ink">Where the cost goes</h3>
      <p className="mt-0.5 text-[12px] text-muted">
        Share of {formatCurrency(total)} total cost
      </p>

      {loading ? (
        <div className="mt-5 flex flex-col gap-3">
          <Skeleton className="h-3.5 w-full rounded-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : unavailable ? (
        <div className="mt-6 text-[13px] text-muted">{unavailable}</div>
      ) : !hasCost ? (
        <div className="mt-6 text-[13px] text-muted">No cost recorded in this period.</div>
      ) : (
        <>
          {/* 2px gaps keep neighbouring segments from reading as one mark. */}
          <div className="mt-5 flex h-3.5 gap-0.5 overflow-hidden rounded-full">
            {slices.map((slice, i) => (
              <div
                key={slice.label}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{
                  width: `${Math.max(slice.share * 100, slice.amount > 0 ? 1.5 : 0)}%`,
                  background: SLICE_COLORS[i % SLICE_COLORS.length],
                }}
              />
            ))}
          </div>

          <ul className="mt-5 flex flex-col gap-3">
            {slices.map((slice, i) => (
              <li key={slice.label} className="flex items-center gap-2.5 text-[13px]">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                  style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }}
                />
                <span className="flex-1 truncate text-ink">{slice.label}</span>
                <span className="tabular-nums text-muted">{formatPercent(slice.share)}</span>
                <span className="w-24 text-right tabular-nums text-ink">
                  {formatCurrency(slice.amount)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
