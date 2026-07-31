import { Database, Settings, ShoppingCart } from 'lucide-react'
import type { DateRange } from '../lib/types'
import { DateRangePicker } from './DateRangePicker'

interface HeaderProps {
  range: DateRange
  onRangeChange: (range: DateRange) => void
}

export function Header({ range, onRangeChange }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#1f1f23] text-ink">
            <ShoppingCart size={17} strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[18px] font-semibold leading-tight">
              Sales Dashboard
            </h1>
            <p className="truncate text-[12px] text-muted">
              Metorik · Facebook Meta Ads · Google Ads
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <OutlineButton icon={<Database size={14} className="text-muted" />}>
            Full Data
          </OutlineButton>
          <OutlineButton icon={<Settings size={14} className="text-muted" />}>
            Customize
          </OutlineButton>
          <DateRangePicker value={range} onChange={onRangeChange} />
        </div>
      </div>
    </header>
  )
}

function OutlineButton({
  icon,
  children,
}: {
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className="flex items-center gap-2 rounded-lg border border-btn-border bg-btn px-3 py-2 text-[13px] text-ink transition-colors hover:border-[#3a3a40]"
    >
      {icon}
      <span className="hidden sm:inline">{children}</span>
    </button>
  )
}
