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
  InsightsReport,
  OperatingCost,
  OrdersPage,
  OrdersQuery,
  SourceError,
  TrafficMetrics,
  WooMetrics,
} from './types'
import { SourceFailure } from './adapters/client'
import * as metorik from './adapters/metorik'
import * as meta from './adapters/meta'
import * as googleAds from './adapters/googleAds'
import * as costs from './adapters/costs'
import * as shippingCosts from './adapters/shippingCosts'
import * as ga4 from './adapters/ga4'
import * as insights from './adapters/insights'

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
  traffic: (range: DateRange, against: DateRange | null) =>
    ['traffic', range.start, range.end, vs(against)] as const,
  // No deltas on either: a GA4 breakdown and a page of orders are lists, and a
  // row has nothing to be compared against.
  ga4: (range: DateRange, dimension: Ga4Dimension) =>
    ['ga4', range.start, range.end, dimension] as const,
  // Not range-scoped: the stored lists are the same whatever period is on screen.
  costs: () => ['costs'] as const,
  shippingCosts: () => ['shippingCosts'] as const,
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
  analyse: (snapshot: Record<string, unknown>) => void
  running: boolean
  error: SourceError | null
}

/**
 * A mutation rather than a query: an OpenAI call costs money on every run, so
 * it fires when the operator asks for it and never on render or refocus.
 */
export function useInsights(): Insights {
  const mutation = useMutation({
    mutationFn: (snapshot: Record<string, unknown>) => unwrap(insights.analyse(snapshot)),
  })

  return {
    report: mutation.data,
    analyse: (snapshot) => mutation.mutate(snapshot),
    running: mutation.isPending,
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
