import { useCallback, useEffect, useState } from 'react'
import { DASHBOARD_TABS, type DashboardView } from './navigation'

/**
 * The open tab, held in the URL rather than only in React state.
 *
 * A reader who refreshes on Email, or opens the dashboard from a bookmark, was
 * returned to the Overview and had to find their way back — which on a page
 * whose tabs each cost an upstream call is a real annoyance rather than a
 * cosmetic one.
 *
 * The hash carries it. There is no router mounted in this app — `main.tsx`
 * renders `App` directly — so a hash is the whole of the mechanism: no
 * dependency, no server route to add, and nothing for Netlify's SPA redirect
 * to catch. It also makes a tab linkable, which a private piece of state can
 * never be.
 *
 * Unknown or absent hashes fall back to the Overview rather than rendering an
 * empty page, so a stale bookmark from a tab that has since been renamed still
 * lands somewhere sensible.
 */
export function useDashboardView(): [DashboardView, (next: DashboardView) => void] {
  const [view, setView] = useState<DashboardView>(() => readHash() ?? 'overview')

  /*
   * Back and forward move between tabs, because selecting one pushes a history
   * entry. This listener is what makes that work — and it also catches a hash
   * typed straight into the address bar, which would otherwise change the URL
   * and nothing else.
   */
  useEffect(() => {
    const onHashChange = () => setView(readHash() ?? 'overview')
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const select = useCallback((next: DashboardView) => {
    // Set first so the tab responds immediately rather than waiting for the
    // hashchange event to come back around.
    setView(next)
    // Guarded, because assigning the hash it already holds is a no-op that
    // still pushes a duplicate history entry — Back would then appear stuck.
    if (readHash() !== next) window.location.hash = next
  }, [])

  return [view, select]
}

/** The hash as a known view, or null when it names nothing this page has. */
function readHash(): DashboardView | null {
  const raw = decodeURIComponent(window.location.hash.replace(/^#/, ''))
  return DASHBOARD_TABS.some((tab) => tab.id === raw) ? (raw as DashboardView) : null
}
