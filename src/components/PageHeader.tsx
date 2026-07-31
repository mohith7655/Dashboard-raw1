import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle: string
  actions?: ReactNode
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[20px] font-semibold leading-tight text-ink">{title}</h2>
        <p className="mt-1 text-[13px] text-muted">{subtitle}</p>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Neutral outline button used across page toolbars. */
export function ToolbarButton({
  icon,
  children,
  onClick,
}: {
  icon?: ReactNode
  children: ReactNode
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg border border-btn-border bg-btn px-3 py-2 text-[13px] text-ink transition-colors hover:border-[#3a3a40]"
    >
      {icon}
      {children}
    </button>
  )
}

/** Empty-state block for pages and cards with nothing to show. */
export function EmptyState({
  icon,
  title,
  detail,
}: {
  icon?: ReactNode
  title: string
  detail?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-5 py-14 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <p className="text-[14px] font-medium text-ink">{title}</p>
      {detail && <p className="max-w-md text-[13px] text-muted">{detail}</p>}
    </div>
  )
}
