import { NavLink } from 'react-router-dom'
import { ChevronDown, ShoppingCart, X } from 'lucide-react'
import { NAV_GROUPS } from '../../lib/navigation'

interface SidebarProps {
  /** Mobile drawer state. Ignored at lg and above, where the rail is static. */
  open: boolean
  onClose: () => void
  storeName: string
}

export function Sidebar({ open, onClose, storeName }: SidebarProps) {
  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
        />
      )}

      <nav
        aria-label="Main"
        className={`fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-line bg-[#111113] transition-transform lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2 border-b border-line px-3 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-black">
            <ShoppingCart size={16} strokeWidth={2.5} />
          </div>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-1.5 py-1 text-[14px] font-semibold text-ink transition-colors hover:bg-[#1c1c20]"
          >
            <span className="truncate">{storeName}</span>
            <ChevronDown size={14} className="shrink-0 text-muted" />
          </button>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted lg:hidden"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {NAV_GROUPS.map((group, i) => (
            <div
              key={group.heading ?? `group-${i}`}
              className={i > 0 ? 'mt-1 border-t border-line pt-3' : ''}
            >
              {group.heading && (
                <div className="flex items-center justify-between px-4 pb-1.5 pt-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7f8ea3]">
                    {group.heading}
                  </span>
                  <ChevronDown size={13} className="text-muted" />
                </div>
              )}

              <ul className="px-2">
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/' || item.to === '/engage'}
                      onClick={onClose}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13.5px] transition-colors ${
                          isActive
                            ? 'bg-[#1c1c20] font-medium text-[#5b8cff]'
                            : 'text-ink hover:bg-[#18181b]'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <item.icon
                            size={16}
                            strokeWidth={2}
                            className={isActive ? 'text-[#5b8cff]' : 'text-muted'}
                          />
                          <span className="truncate">{item.label}</span>
                          {item.badge && (
                            <span className="ml-auto rounded bg-[#26262b] px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wide text-[#9aa4b8]">
                              {item.badge}
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>
    </>
  )
}
