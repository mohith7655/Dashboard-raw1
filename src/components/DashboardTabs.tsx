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
      <div
        role="tablist"
        aria-label="Dashboard views"
        className="flex flex-wrap gap-1 border-b border-line"
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
              className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors ${
                selected ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              <tab.icon size={14} strokeWidth={2} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {current && <p className="mt-3 text-[12px] text-muted">{current.blurb}</p>}
    </div>
  )
}
