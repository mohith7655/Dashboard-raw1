/**
 * What each target's own window has traded so far.
 *
 * The rest of the dashboard is scoped by the picker. A target is not: it names
 * its own start and end, and the money already spent against it and the sales
 * already made towards it fall inside that window whatever period happens to
 * be on screen. Reading a target's progress off the picker asked the store to
 * earn the whole goal again from today, and to fund it from a budget it had
 * already spent half of.
 */
import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import type {
  AdsMetrics,
  DateRange,
  OperatingCost,
  Target,
  TargetProgress,
  WooMetrics,
} from './types'
import { daysInRange, latestAvailableDate } from './dateRange'
import { effectiveStart } from './targets'
import { netProfitOf, revenueOf, totalSalesOf } from './pnl'
import { costLines, totalOperatingCost } from './operatingCosts'
import { SourceFailure } from './adapters/client'
import * as metorik from './adapters/metorik'
import * as meta from './adapters/meta'
import * as googleAds from './adapters/googleAds'
import * as openaiAds from './adapters/openaiAds'
import { queryKeys } from './queries'

/** Below this the return is treated as unknown rather than as poor. */
const MIN_MEANINGFUL_SPEND = 1

/**
 * The part of a target's window that is finished, or null where none is.
 *
 * Ends yesterday, not today. The days remaining are counted from today
 * inclusive — today is a day you can still trade in — so banking today as well
 * would put it on both sides of the ledger: its takings counted as already
 * earned, and a full day's worth of them projected again over what is left.
 * Ending here instead makes banked days and remaining days sum exactly to the
 * window, which is the property that lets the card's figures reconcile.
 *
 * The cost is that today's own trading is not yet banked. That is the same
 * part-day the header's Today toggle exists for, and understating progress by
 * a fraction of one day is the safer of the two errors.
 */
export function elapsedWindow(target: Target, today: string): DateRange | null {
  const opens = effectiveStart(target)
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10)
  // Capped at the deadline, so an overdue target reports the window it had
  // rather than everything since — which would go on growing after it closed.
  const end = yesterday < target.deadline ? yesterday : target.deadline
  // Nothing finished yet: the window has not opened, or opened only today.
  if (end < opens) return null
  return { start: opens, end, preset: 'custom' }
}

const keyOf = (window: DateRange): string => `${window.start}:${window.end}`

export interface TargetProgressMap {
  /** Keyed by target id. Absent while loading, or where the window is closed. */
  byTarget: Record<string, TargetProgress | null>
  loading: boolean
}

/**
 * One fetch per distinct window, not per target.
 *
 * Two targets running to the same month end share a window and so share a
 * request. The queries are keyed exactly as the dashboard's own are, so a
 * target window that happens to match the range on screen is served from the
 * cache rather than fetched twice.
 */
export function useTargetProgress(
  targets: Target[] | undefined,
  costs: OperatingCost[] | undefined,
  today: string,
): TargetProgressMap {
  const windows = useMemo(() => {
    const found = new Map<string, DateRange>()
    for (const target of targets ?? []) {
      const window = elapsedWindow(target, today)
      if (window) found.set(keyOf(window), window)
    }
    return [...found.values()]
  }, [targets, today])

  // Four connectors per window: the store, and every platform that reports
  // spend. OpenAI Ads is among them — it attributes no conversions, which is
  // why it stays out of blended *return*, but the money still left the account
  // and a target's budget is about money spent. Leaving it out had this
  // section reporting a spend the All ads card contradicted by $851 on the
  // very same period.
  const wooQueries = useQueries({
    queries: windows.map((window) => ({
      queryKey: queryKeys.woo(window, null),
      queryFn: () => unwrap(metorik.fetchMetrics(window, null)),
      // A target window is a settled period for all but its last day; there is
      // no reason to chase it on every refocus.
      staleTime: 5 * 60_000,
    })),
  })

  const metaQueries = useQueries({
    queries: windows.map((window) => ({
      queryKey: queryKeys.meta(window, null),
      queryFn: () => unwrap(meta.fetchMetrics(window, null)),
      staleTime: 5 * 60_000,
    })),
  })

  const googleQueries = useQueries({
    queries: windows.map((window) => ({
      queryKey: queryKeys.googleAds(window, null),
      queryFn: () => unwrap(googleAds.fetchMetrics(window, null)),
      staleTime: 5 * 60_000,
    })),
  })

  const openaiQueries = useQueries({
    queries: windows.map((window) => ({
      queryKey: queryKeys.openaiAds(window, null),
      queryFn: () => unwrap(openaiAds.fetchMetrics(window, null)),
      staleTime: 5 * 60_000,
    })),
  })

  return useMemo(() => {
    const byWindow = new Map<string, TargetProgress>()
    let loading = false

    windows.forEach((window, i) => {
      const woo = wooQueries[i]
      const ads = [metaQueries[i], googleQueries[i], openaiQueries[i]]

      // Nothing is published while a connector is still answering. Spend
      // summed over the platforms that happen to have replied is a real number
      // arrived at from an incomplete set, and it lands on the card as "$0.00
      // spent so far" — indistinguishable from a window that genuinely spent
      // nothing, and gone a second later when the rest arrives.
      if (woo.isPending || ads.some((query) => query.isPending)) {
        loading = true
        return
      }

      // The store is the only one that cannot be missing: every money aim is
      // struck from it. A failed ad platform contributes no spend rather than
      // zero spend, which is the same distinction the rest of the dashboard
      // draws — but with nothing from Metorik there is no progress at all.
      if (!woo.data) return

      byWindow.set(
        keyOf(window),
        progressFrom(window, woo.data, ads.map((query) => query.data), costs),
      )
    })

    const byTarget: Record<string, TargetProgress | null> = {}
    for (const target of targets ?? []) {
      const window = elapsedWindow(target, today)
      byTarget[target.id] = window
        ? (byWindow.get(keyOf(window)) ?? null)
        : // Not started: nothing banked, nothing spent, no days traded. A real
          // zero rather than an absence, because the window is genuinely empty.
          EMPTY
    }

    return { byTarget, loading }
  }, [windows, wooQueries, metaQueries, googleQueries, openaiQueries, targets, costs, today])
}

const EMPTY: TargetProgress = {
  days: 0,
  revenue: 0,
  sales: 0,
  profit: 0,
  spend: 0,
  roas: null,
}

/**
 * The store's recent trading, in the same shape, for targets whose own window
 * has nothing in it yet.
 *
 * Built from the page-level metrics the Overview has already fetched, so it
 * costs no request — and from the same statement helpers the CEO card prints,
 * so a plan struck from it quotes the figures on screen.
 */
export function baselineProgress(
  range: DateRange,
  woo: WooMetrics | undefined,
  adSpend: number | null,
  costs: OperatingCost[] | undefined,
): TargetProgress | null {
  if (!woo) return null
  const spend = adSpend ?? 0
  const revenue = revenueOf(woo.pnl)
  const operatingCost = totalOperatingCost(costLines(costs ?? [], range))

  return {
    days: daysInRange(range),
    revenue,
    sales: totalSalesOf(woo.pnl),
    profit: netProfitOf(woo.pnl, adSpend, operatingCost),
    spend,
    roas: spend >= MIN_MEANINGFUL_SPEND ? revenue / spend : null,
  }
}

function progressFrom(
  window: DateRange,
  woo: WooMetrics,
  ads: (AdsMetrics | undefined)[],
  costs: OperatingCost[] | undefined,
): TargetProgress {
  const reported = ads.filter((m): m is AdsMetrics => !!m)
  const spend = reported.reduce((sum, m) => sum + m.spend.value, 0)

  const revenue = revenueOf(woo.pnl)
  const sales = totalSalesOf(woo.pnl)
  // Overheads prorated onto the window, as the CEO statement prorates them onto
  // the period — so a profit aim is measured the way profit is printed.
  const operatingCost = totalOperatingCost(costLines(costs ?? [], window))
  // Ad spend absent rather than zero when no platform reported: subtracting a
  // zero would state a profit the store has not been shown to have made.
  const profit = netProfitOf(woo.pnl, reported.length ? spend : null, operatingCost)

  return {
    days: daysInRange(window),
    revenue,
    sales,
    profit,
    spend,
    roas: spend >= MIN_MEANINGFUL_SPEND ? revenue / spend : null,
  }
}

/** As in `queries.ts`: adapters never throw, so their error is rethrown here. */
async function unwrap<T>(result: Promise<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await result
  if (error) throw new SourceFailure(error as never)
  if (data === null) {
    throw new SourceFailure({ source: 'Unknown', message: 'No data returned' })
  }
  return data
}

/** Today on the store's calendar — the day a window is counted up to. */
export const progressToday = (): string => latestAvailableDate()
