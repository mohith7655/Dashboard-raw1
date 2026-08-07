import { useState } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query'
import type {
  AdapterResult,
  AdsMetrics,
  CountryShippingCost,
  DateRange,
  Ga4Dimension,
  Ga4Report,
  GscDimension,
  GscReport,
  MarkifactAccount,
  MerchantFeed,
  InsightsAnswer,
  InsightsAutomation,
  InsightsReport,
  InsightsSchedule,
  OperatingCost,
  OrdersPage,
  OrdersQuery,
  ShippingChargedPayload,
  SourceError,
  TrafficMetrics,
  WooMetrics,
} from './types'
import { SourceFailure } from './adapters/client'
import * as metorik from './adapters/metorik'
import * as meta from './adapters/meta'
import * as googleAds from './adapters/googleAds'
import * as openaiAds from './adapters/openaiAds'
import * as costs from './adapters/costs'
import * as shippingCosts from './adapters/shippingCosts'
import * as ga4 from './adapters/ga4'
import * as searchConsole from './adapters/searchConsole'
import * as merchantCenter from './adapters/merchantCenter'
import * as markifact from './adapters/markifact'
import * as insights from './adapters/insights'
import * as insightsSchedule from './adapters/insightsSchedule'

/**
 * Each section subscribes to its own query, so one failing connector never
 * blanks out the rest of the dashboard.
 */
/**
 * The comparison window is part of a cached response, not just of the request
 * that fetched it — the same range compared against last month and against last
 * year are two different payloads. Keying on it stops the second one being
 * served the first one's deltas.
 */
const vs = (against: DateRange | null): string =>
  against ? `${against.start}:${against.end}` : 'none'

export const queryKeys = {
  woo: (range: DateRange, against: DateRange | null) =>
    ['woo', range.start, range.end, vs(against)] as const,
  orders: (range: DateRange, q: OrdersQuery) =>
    ['orders', range.start, range.end, q.page, q.perPage, q.sort, q.direction] as const,
  meta: (range: DateRange, against: DateRange | null) =>
    ['meta', range.start, range.end, vs(against)] as const,
  googleAds: (range: DateRange, against: DateRange | null) =>
    ['googleAds', range.start, range.end, vs(against)] as const,
  openaiAds: (range: DateRange, against: DateRange | null) =>
    ['openaiAds', range.start, range.end, vs(against)] as const,
  traffic: (range: DateRange, against: DateRange | null) =>
    ['traffic', range.start, range.end, vs(against)] as const,
  // Keyed on the destinations too: asking about a different set is a different
  // answer, and reusing the cached one would leave a country blank.
  shippingCharged: (range: DateRange, countries: string[]) =>
    ['shippingCharged', range.start, range.end, countries.join(',')] as const,
  // No deltas on either: a GA4 breakdown and a page of orders are lists, and a
  // row has nothing to be compared against.
  ga4: (range: DateRange, dimension: Ga4Dimension) =>
    ['ga4', range.start, range.end, dimension] as const,
  // Search Console does carry deltas — the totals are compared window to
  // window — so unlike GA4 its key has to hold the comparison too.
  searchConsole: (range: DateRange, dimension: GscDimension, against: DateRange | null) =>
    ['searchConsole', range.start, range.end, dimension, vs(against)] as const,
  // Not range-scoped: the stored lists, the feed's current state and the
  // Markifact workspace are the same whatever period is on screen.
  costs: () => ['costs'] as const,
  shippingCosts: () => ['shippingCosts'] as const,
  insightsAutomation: () => ['insightsAutomation'] as const,
  merchantFeed: () => ['merchantFeed'] as const,
  markifact: () => ['markifact'] as const,
}

/** Adapters never throw; rethrow their error so the query layer can retry it. */
async function unwrap<T>(result: Promise<AdapterResult<T>>): Promise<T> {
  const { data, error } = await result
  if (error) throw new SourceFailure(error)
  if (data === null) throw new SourceFailure({ source: 'Unknown', message: 'No data returned' })
  return data
}

export interface SourceQuery<T> {
  data: T | undefined
  error: SourceError | null
  isLoading: boolean
  isFetching: boolean
  refetch: () => void
}

function toSourceQuery<T>(query: UseQueryResult<T, Error>): SourceQuery<T> {
  return {
    data: query.data,
    error: query.error instanceof SourceFailure ? query.error.sourceError : null,
    isLoading: query.isPending,
    isFetching: query.isFetching,
    refetch: () => void query.refetch(),
  }
}

export function useWooMetrics(
  range: DateRange,
  against: DateRange | null,
): SourceQuery<WooMetrics> {
  return toSourceQuery(
    useQuery({
      queryKey: queryKeys.woo(range, against),
      queryFn: () => unwrap(metorik.fetchMetrics(range, against)),
    }),
  )
}

export function useOrders(range: DateRange, q: OrdersQuery): SourceQuery<OrdersPage> {
  return toSourceQuery(
    useQuery({
      queryKey: queryKeys.orders(range, q),
      queryFn: () => unwrap(metorik.fetchOrders(range, q)),
      // Keeps the previous page on screen while the next one loads.
      placeholderData: (prev) => prev,
    }),
  )
}

export function useMetaMetrics(
  range: DateRange,
  against: DateRange | null,
): SourceQuery<AdsMetrics> {
  return toSourceQuery(
    useQuery({
      queryKey: queryKeys.meta(range, against),
      queryFn: () => unwrap(meta.fetchMetrics(range, against)),
    }),
  )
}

export function useGoogleAdsMetrics(
  range: DateRange,
  against: DateRange | null,
): SourceQuery<AdsMetrics> {
  return toSourceQuery(
    useQuery({
      queryKey: queryKeys.googleAds(range, against),
      queryFn: () => unwrap(googleAds.fetchMetrics(range, against)),
    }),
  )
}

export function useOpenAiAdsMetrics(
  range: DateRange,
  against: DateRange | null,
): SourceQuery<AdsMetrics> {
  return toSourceQuery(
    useQuery({
      queryKey: queryKeys.openaiAds(range, against),
      queryFn: () => unwrap(openaiAds.fetchMetrics(range, against)),
    }),
  )
}

export function useTrafficMetrics(
  range: DateRange,
  against: DateRange | null,
): SourceQuery<TrafficMetrics> {
  return toSourceQuery(
    useQuery({
      queryKey: queryKeys.traffic(range, against),
      queryFn: () => unwrap(metorik.fetchTraffic(range, against)),
    }),
  )
}

/**
 * Postage charged per destination — one upstream call per country, so it is
 * loaded only when the Shipping tab asks for it.
 *
 * Disabled until the country list arrives: firing with none would return an
 * empty split and cache it under a key the real list would never match.
 */
export function useShippingCharged(
  range: DateRange,
  countries: string[],
): SourceQuery<ShippingChargedPayload> {
  return toSourceQuery(
    useQuery({
      queryKey: queryKeys.shippingCharged(range, countries),
      queryFn: () => unwrap(metorik.fetchShippingCharged(range, countries)),
      enabled: countries.length > 0,
    }),
  )
}

export function useGa4Report(
  range: DateRange,
  dimension: Ga4Dimension,
): SourceQuery<Ga4Report> {
  return toSourceQuery(
    useQuery({
      queryKey: queryKeys.ga4(range, dimension),
      queryFn: () => unwrap(ga4.fetchReport(range, dimension)),
      // Switching breakdown keeps the previous table on screen rather than
      // collapsing the card to a skeleton on every click.
      placeholderData: (prev) => prev,
    }),
  )
}

/**
 * Organic search for the period.
 *
 * `enabled` gates it on the tab rather than the range: Search Console is four
 * upstream calls per view, and a tab nobody has opened should not be paying
 * for them on every date change.
 */
export function useSearchConsole(
  range: DateRange,
  dimension: GscDimension,
  against: DateRange | null,
  enabled: boolean,
): SourceQuery<GscReport> {
  return toSourceQuery(
    useQuery({
      queryKey: queryKeys.searchConsole(range, dimension, against),
      queryFn: () => unwrap(searchConsole.fetchReport(range, dimension, against)),
      enabled,
      // Switching breakdown keeps the previous table on screen rather than
      // collapsing the card to a skeleton on every click.
      placeholderData: (prev) => prev,
    }),
  )
}

/** The feed as it stands. No range — a feed has a state, not a history. */
export function useMerchantFeed(enabled: boolean): SourceQuery<MerchantFeed> {
  return toSourceQuery(
    useQuery({
      queryKey: queryKeys.merchantFeed(),
      queryFn: () => unwrap(merchantCenter.fetchFeed()),
      enabled,
    }),
  )
}

/** The Markifact workspace: credits, connections and recent operations. */
export function useMarkifact(enabled: boolean): SourceQuery<MarkifactAccount> {
  return toSourceQuery(
    useQuery({
      queryKey: queryKeys.markifact(),
      queryFn: () => unwrap(markifact.fetchAccount()),
      enabled,
    }),
  )
}

export function useOperatingCosts(): SourceQuery<OperatingCost[]> {
  return toSourceQuery(
    useQuery({
      queryKey: queryKeys.costs(),
      queryFn: () => unwrap(costs.fetchCosts()),
    }),
  )
}

export interface Insights {
  report: InsightsReport | undefined
  /** The range is carried so the report can be stored knowing what it describes. */
  analyse: (snapshot: Record<string, unknown>, range: DateRange) => void
  running: boolean
  error: SourceError | null
}

/**
 * A mutation rather than a query: an OpenAI call costs money on every run, so
 * it fires when the operator asks for it and never on render or refocus.
 */
export function useInsights(): Insights {
  const client = useQueryClient()
  const mutation = useMutation({
    mutationFn: ({ snapshot }: { snapshot: Record<string, unknown>; range: DateRange }) =>
      unwrap(insights.analyse(snapshot)),
    onSuccess: async (report, { range }) => {
      // Kept alongside the scheduled ones so a reload does not throw away a
      // report that has just been paid for. A store that refuses is swallowed
      // deliberately: the report is on screen and readable either way, and
      // failing the run over its filing would be the worse outcome.
      const automation = await insightsSchedule
        .saveLatestReport({ report, range, trigger: 'manual' })
        .catch(() => null)
      if (automation) client.setQueryData(queryKeys.insightsAutomation(), automation)
    },
  })

  return {
    report: mutation.data,
    analyse: (snapshot, range) => mutation.mutate({ snapshot, range }),
    running: mutation.isPending,
    error: mutation.error instanceof SourceFailure ? mutation.error.sourceError : null,
  }
}

/**
 * The report schedule and whatever the last run left behind.
 *
 * Polled rather than read once: a report written overnight should appear on a
 * dashboard that was left open, and the read is a single small blob rather
 * than an upstream call.
 */
export function useInsightsAutomation(): SourceQuery<InsightsAutomation> {
  return toSourceQuery(
    useQuery({
      queryKey: queryKeys.insightsAutomation(),
      queryFn: () => unwrap(insightsSchedule.fetchAutomation()),
      refetchInterval: 10 * 60_000,
    }),
  )
}

export interface SaveSchedule {
  save: (schedule: InsightsSchedule) => void
  saving: boolean
  error: string | null
}

export function useSaveInsightsSchedule(): SaveSchedule {
  const client = useQueryClient()
  const mutation = useMutation({
    mutationFn: insightsSchedule.saveSchedule,
    onSuccess: (saved) => client.setQueryData(queryKeys.insightsAutomation(), saved),
  })

  return {
    save: (next) => mutation.mutate(next),
    saving: mutation.isPending,
    error: mutation.error ? mutation.error.message : null,
  }
}

export interface AskInsights {
  ask: (input: { snapshot: Record<string, unknown>; question: string }) => void
  answers: InsightsAnswer[]
  asking: boolean
  error: SourceError | null
}

/**
 * Questions typed against the period on screen.
 *
 * Answers accumulate rather than replacing one another: a reader asks a second
 * question because of what the first one said, and losing the first would
 * break that thread. Kept in the hook rather than a query cache — an answer is
 * an event, not a resource to refetch.
 */
export function useAskInsights(): AskInsights {
  const [answers, setAnswers] = useState<InsightsAnswer[]>([])
  const mutation = useMutation({
    mutationFn: ({
      snapshot,
      question,
    }: {
      snapshot: Record<string, unknown>
      question: string
    }) => unwrap(insights.ask(snapshot, question)),
    onSuccess: (answer) => setAnswers((current) => [...current, answer]),
  })

  return {
    ask: (input) => mutation.mutate(input),
    answers,
    asking: mutation.isPending,
    error: mutation.error instanceof SourceFailure ? mutation.error.sourceError : null,
  }
}

export function useShippingCosts(): SourceQuery<CountryShippingCost[]> {
  return toSourceQuery(
    useQuery({
      queryKey: queryKeys.shippingCosts(),
      queryFn: () => unwrap(shippingCosts.fetchShippingCosts()),
    }),
  )
}

export interface SaveShippingCosts {
  save: (costs: CountryShippingCost[]) => void
  saving: boolean
  error: string | null
}

export function useSaveShippingCosts(): SaveShippingCosts {
  const client = useQueryClient()
  const mutation = useMutation({
    mutationFn: shippingCosts.saveShippingCosts,
    onSuccess: (saved) => client.setQueryData(queryKeys.shippingCosts(), saved),
  })

  return {
    save: (next) => mutation.mutate(next),
    saving: mutation.isPending,
    error: mutation.error ? mutation.error.message : null,
  }
}

export interface SaveCosts {
  save: (costs: OperatingCost[]) => void
  saving: boolean
  error: string | null
}

/**
 * Writes the list back and seeds the cache with what the server stored, so the
 * table shows the saved rows rather than the optimistic ones.
 */
export function useSaveOperatingCosts(): SaveCosts {
  const client = useQueryClient()
  const mutation = useMutation({
    mutationFn: costs.saveCosts,
    onSuccess: (saved) => client.setQueryData(queryKeys.costs(), saved),
  })

  return {
    save: (next) => mutation.mutate(next),
    saving: mutation.isPending,
    error: mutation.error ? mutation.error.message : null,
  }
}
