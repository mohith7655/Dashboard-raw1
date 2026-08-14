import type { ReactNode } from 'react'
import { Skeleton } from '../Skeleton'

interface ChartCardProps {
  title: string
  /** Omitted, or empty, where the plot and its legend say enough on their own. */
  subtitle?: string
  height: number
  loading?: boolean
  /** Rendered in place of the plot when the source failed. */
  unavailable?: string
  children: ReactNode
}

export function ChartCard({
  title,
  subtitle,
  height,
  loading,
  unavailable,
  children,
}: ChartCardProps) {
  return (
    <div className="card">
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {/* Nothing at all rather than an empty paragraph, which would still take
          its line height and leave the plot sitting low in the card. */}
      {subtitle && <p className="mt-0.5 text-[12px] text-muted">{subtitle}</p>}

      <div className="mt-4" style={{ height }}>
        {loading ? (
          <Skeleton className="h-full w-full" />
        ) : unavailable ? (
          <div className="flex h-full items-center justify-center text-[13px] text-muted">
            {unavailable}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}

/** Shared light tooltip surface used by every chart on the page. */
export function TooltipCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-[#d8d8dd] bg-[#f7f7f9] px-3 py-2 text-[12px] text-[#1a1a1d] shadow-lg shadow-black/30">
      {children}
    </div>
  )
}
