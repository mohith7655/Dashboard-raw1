import { DASHBOARD_TABS, type DashboardView } from '../lib/navigation'

interface DashboardTabsProps {
  active: DashboardView
  onChange: (view: DashboardView) => void
}

/** Cuts of the same period, sitting directly above the first section. */
export function DashboardTabs({ active, onChange }: DashboardTabsProps) {
  const current = DASHBOARD_TABS.find((tab) => tab.id === active)

  return (
    <div className="mb-6">
      {/* One swipeable row rather than three wrapped ones. Wrapping cost most
          of a phone screen before the first figure, and broke the line the
          selected tab sits on into a stack of rules. */}
      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div
          role="tablist"
          aria-label="Dashboard views"
          // `w-max` so the row can outgrow the screen and scroll; `min-w-full`
          // so the rule under it still spans the full width on a desktop where
          // every tab already fits.
          className="flex w-max min-w-full gap-1 border-b border-line"
        >
          {DASHBOARD_TABS.map((tab) => {
            const selected = tab.id === active
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onChange(tab.id)}
                className={`-mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors ${
                  selected ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                <tab.icon size={14} strokeWidth={2} />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {current && <p className="mt-3 text-[12px] text-muted">{current.blurb}</p>}
    </div>
  )
}
