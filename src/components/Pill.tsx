import type { ReactNode } from 'react'

interface PillProps {
  children: ReactNode
  /** Base hex colour; background and border are derived from it. */
  color: string
}

/** Tinted status badge. Always carries text, never colour alone. */
export function Pill({ children, color }: PillProps) {
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ color, background: `${color}1f`, border: `1px solid ${color}33` }}
    >
      {children}
    </span>
  )
}

/** Neutral palette reused by the non-order status pills across pages. */
export const PILL_COLORS = {
  green: '#22c55e',
  blue: '#3b82f6',
  amber: '#eab308',
  red: '#ef4444',
  grey: '#8a8a92',
  violet: '#a78bfa',
  pink: '#f43f5e',
} as const

/** Thin horizontal progress bar used by Goals and engagement scores. */
export function ProgressBar({
  value,
  color = '#3b82f6',
}: {
  /** 0–1; values above 1 are clamped for the bar but not for the label. */
  value: number
  color?: string
}) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#26262b]">
      <div
        className="h-full rounded-full transition-[width]"
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%`, background: color }}
      />
    </div>
  )
}
