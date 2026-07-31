import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { AdapterResult, DateRange, SourceError } from './types'
import { SourceFailure } from './adapters/client'
import type { ListQuery } from './adapters/resources'
import * as api from './adapters/resources'

async function unwrap<T>(result: Promise<AdapterResult<T>>): Promise<T> {
  const { data, error } = await result
  if (error) throw new SourceFailure(error)
  if (data === null) {
    throw new SourceFailure({ source: 'Unknown', message: 'No data returned' })
  }
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

const rangeKey = (range: DateRange): [string, string] => [range.start, range.end]
const listKey = (q: ListQuery): [number, number, string, string] => [
  q.page,
  q.perPage,
  q.sort,
  q.direction,
]

/** A list resource: paginated, sorted, and isolated to its own query. */
function useListResource<T>(
  name: string,
  range: DateRange,
  q: ListQuery,
  fetcher: (range: DateRange, q: ListQuery) => Promise<AdapterResult<T>>,
): SourceQuery<T> {
  return toSourceQuery(
    useQuery({
      queryKey: [name, ...rangeKey(range), ...listKey(q)],
      queryFn: () => unwrap(fetcher(range, q)),
      placeholderData: (prev) => prev,
    }),
  )
}

/** A whole-collection resource with no pagination. */
function useRangeResource<T>(
  name: string,
  range: DateRange,
  fetcher: (range: DateRange) => Promise<AdapterResult<T>>,
): SourceQuery<T> {
  return toSourceQuery(
    useQuery({
      queryKey: [name, ...rangeKey(range)],
      queryFn: () => unwrap(fetcher(range)),
    }),
  )
}

/* -------------------------------- Commerce ---------------------------- */

export const useCustomers = (range: DateRange, q: ListQuery) =>
  useListResource('customers', range, q, api.fetchCustomers)

export const useProducts = (range: DateRange, q: ListQuery) =>
  useListResource('products', range, q, api.fetchProducts)

export const useCoupons = (range: DateRange, q: ListQuery) =>
  useListResource('coupons', range, q, api.fetchCoupons)

export const useCarts = (range: DateRange, q: ListQuery) =>
  useListResource('carts', range, q, api.fetchCarts)

/* --------------------------------- Analyze ---------------------------- */

export const useReports = (range: DateRange) =>
  useRangeResource('reports', range, api.fetchReports)

export const useCohorts = (range: DateRange) =>
  useRangeResource('cohorts', range, api.fetchCohorts)

export const useGoals = (range: DateRange) =>
  useRangeResource('goals', range, api.fetchGoals)

export const useDigests = (range: DateRange) =>
  useRangeResource('digests', range, api.fetchDigests)

export const useExports = (range: DateRange) =>
  useRangeResource('exports', range, api.fetchExports)

export const useCosts = (range: DateRange, q: ListQuery) =>
  useListResource('costs', range, q, api.fetchCosts)

export const useCustomMetrics = (range: DateRange) =>
  useRangeResource('customMetrics', range, api.fetchCustomMetrics)

/* ---------------------------------- Engage ---------------------------- */

export const useEngageOverview = (range: DateRange) =>
  useRangeResource('engageOverview', range, api.fetchEngageOverview)

export const useCampaigns = (range: DateRange, q: ListQuery) =>
  useListResource('campaigns', range, q, api.fetchCampaigns)

export const useProfiles = (range: DateRange, q: ListQuery) =>
  useListResource('profiles', range, q, api.fetchProfiles)

export const useSentEmails = (range: DateRange, q: ListQuery) =>
  useListResource('sentEmails', range, q, api.fetchSentEmails)

/* ------------------------------ Config status ------------------------- */

export function useConfigStatus(): SourceQuery<
  Awaited<ReturnType<typeof api.fetchConfigStatus>>['data'] extends infer T
    ? NonNullable<T>
    : never
> {
  return toSourceQuery(
    useQuery({
      queryKey: ['configStatus'],
      queryFn: () => unwrap(api.fetchConfigStatus()),
      staleTime: 30_000,
    }),
  )
}
