import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query'
import type {
  AdapterResult,
  AdsMetrics,
  DateRange,
  OperatingCost,
  OrdersPage,
  OrdersQuery,
  SourceError,
  WooMetrics,
} from './types'
import { SourceFailure } from './adapters/client'
import * as metorik from './adapters/metorik'
import * as meta from './adapters/meta'
import * as googleAds from './adapters/googleAds'
import * as costs from './adapters/costs'

/**
 * Each section subscribes to its own query, so one failing connector never
 * blanks out the rest of the dashboard.
 */
export const queryKeys = {
  woo: (range: DateRange) => ['woo', range.start, range.end] as const,
  orders: (range: DateRange, q: OrdersQuery) =>
    ['orders', range.start, range.end, q.page, q.perPage, q.sort, q.direction] as const,
  meta: (range: DateRange) => ['meta', range.start, range.end] as const,
  googleAds: (range: DateRange) => ['googleAds', range.start, range.end] as const,
  // Not range-scoped: the stored list is the same whatever period is on screen.
  costs: () => ['costs'] as const,
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

export function useWooMetrics(range: DateRange): SourceQuery<WooMetrics> {
  return toSourceQuery(
    useQuery({
      queryKey: queryKeys.woo(range),
      queryFn: () => unwrap(metorik.fetchMetrics(range)),
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

export function useMetaMetrics(range: DateRange): SourceQuery<AdsMetrics> {
  return toSourceQuery(
    useQuery({
      queryKey: queryKeys.meta(range),
      queryFn: () => unwrap(meta.fetchMetrics(range)),
    }),
  )
}

export function useGoogleAdsMetrics(range: DateRange): SourceQuery<AdsMetrics> {
  return toSourceQuery(
    useQuery({
      queryKey: queryKeys.googleAds(range),
      queryFn: () => unwrap(googleAds.fetchMetrics(range)),
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
