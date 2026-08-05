import { useMemo, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Database, Menu, Settings } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { DateRangePicker } from '../DateRangePicker'
import { RangeContext } from '../../lib/rangeContext'
import {
  DEFAULT_COMPARISON,
  clampRangeToAvailable,
  rangeFromPreset,
  resolveComparison,
} from '../../lib/dateRange'
import { NAV_GROUPS } from '../../lib/navigation'
import type { Comparison, DateRange } from '../../lib/types'

const STORE_NAME = 'Rawwgear.com'

export function AppShell() {
  const [range, setRange] = useState<DateRange>(() => rangeFromPreset('thisMonth'))
  const [comparison, setComparison] = useState<Comparison>(DEFAULT_COMPARISON)
  const [navOpen, setNavOpen] = useState(false)
  const { pathname } = useLocation()

  const rangeValue = useMemo(
    () => ({
      range,
      // Clamped on the way in, as in App: nothing derived from the range —
      // prorated operating costs above all — may be measured against days
      // that have not happened yet.
      setRange: (next: DateRange) => setRange(clampRangeToAvailable(next)),
      comparison,
      setComparison,
      against: resolveComparison(range, comparison),
    }),
    [range, comparison],
  )

  const title =
    NAV_GROUPS.flatMap((g) => g.items).find((i) => i.to === pathname)?.label ??
    'Dashboard'

  return (
    <RangeContext.Provider value={rangeValue}>
      <div className="min-h-screen bg-bg">
        <Sidebar
          open={navOpen}
          onClose={() => setNavOpen(false)}
          storeName={STORE_NAME}
        />

        <div className="lg:pl-60">
          <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
            <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-3 px-4 py-3">
              <button
                type="button"
                aria-label="Open navigation"
                onClick={() => setNavOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-btn-border bg-btn text-muted lg:hidden"
              >
                <Menu size={16} />
              </button>

              <div className="min-w-0 flex-1">
                <h1 className="truncate text-[18px] font-semibold leading-tight">
                  {title}
                </h1>
                <p className="truncate text-[12px] text-muted">
                  Metorik · Facebook Meta Ads · Google Ads
                </p>
              </div>

              <div className="flex items-center gap-2">
                <OutlineButton icon={<Database size={14} className="text-muted" />}>
                  Full Data
                </OutlineButton>
                <OutlineButton icon={<Settings size={14} className="text-muted" />}>
                  Customize
                </OutlineButton>
                <DateRangePicker
                  value={range}
                  onChange={setRange}
                  comparison={comparison}
                  onComparisonChange={setComparison}
                />
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-[1280px] px-4 py-6">
            <Outlet />
          </main>
        </div>
      </div>
    </RangeContext.Provider>
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
