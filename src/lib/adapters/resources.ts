/**
 * Resource adapters use the same Netlify function boundary as the dashboard.
 * They intentionally never fabricate rows when a connector is unavailable.
 */
import type { AdapterResult, DateRange, SortDirection } from '../types'
import type { ConfigStatus } from '../envVars'
import type {
  CampaignsPayload,
  CartsPayload,
  CohortRow,
  CostsPayload,
  CouponsPayload,
  CustomMetricRow,
  CustomersPayload,
  DigestRow,
  EngageOverview,
  ExportRow,
  GoalRow,
  ProductsPayload,
  ProfilesPayload,
  ReportRow,
  SentEmailsPayload,
} from '../data/types'
import { callFunction, toResult } from './client'

const METORIK = 'Metorik'
const METORIK_HINT =
  'This data could not be loaded. Check the Metorik API key in your Netlify environment, then click Retry.'
const ENGAGE = 'Metorik Engage'
const ENGAGE_HINT =
  'The Engage connector could not be reached. Check METORIK_ENGAGE_API_KEY in your Netlify environment, then click Retry.'

export interface ListQuery {
  page: number
  perPage: number
  sort: string
  direction: SortDirection
}

const listParams = (query: ListQuery): Record<string, string> => ({
  page: String(query.page),
  perPage: String(query.perPage),
  sort: query.sort,
  direction: query.direction,
})

const metorikResource = <T>(
  name: string,
  range: DateRange,
  params: Record<string, string> = {},
): Promise<AdapterResult<T>> =>
  toResult(METORIK, METORIK_HINT, () =>
    callFunction<T>('metorik', range, { resource: name, ...params }),
  )

const engageResource = <T>(
  name: string,
  range: DateRange,
  params: Record<string, string> = {},
): Promise<AdapterResult<T>> =>
  toResult(ENGAGE, ENGAGE_HINT, () =>
    callFunction<T>('metorik-engage', range, { resource: name, ...params }),
  )

export const fetchCustomers = (range: DateRange, query: ListQuery) =>
  metorikResource<CustomersPayload>('customers', range, listParams(query))

export const fetchProducts = (range: DateRange, query: ListQuery) =>
  metorikResource<ProductsPayload>('products', range, listParams(query))

export const fetchCoupons = (range: DateRange, query: ListQuery) =>
  metorikResource<CouponsPayload>('coupons', range, listParams(query))

export const fetchCarts = (range: DateRange, query: ListQuery) =>
  metorikResource<CartsPayload>('carts', range, listParams(query))

export const fetchReports = (range: DateRange) => metorikResource<ReportRow[]>('reports', range)
export const fetchCohorts = (range: DateRange) => metorikResource<CohortRow[]>('cohorts', range)
export const fetchGoals = (range: DateRange) => metorikResource<GoalRow[]>('goals', range)
export const fetchDigests = (range: DateRange) => metorikResource<DigestRow[]>('digests', range)
export const fetchExports = (range: DateRange) => metorikResource<ExportRow[]>('exports', range)
export const fetchCosts = (range: DateRange, query: ListQuery) =>
  metorikResource<CostsPayload>('costs', range, listParams(query))
export const fetchCustomMetrics = (range: DateRange) =>
  metorikResource<CustomMetricRow[]>('custom-metrics', range)
export const fetchEngageOverview = (range: DateRange) => engageResource<EngageOverview>('overview', range)
export const fetchCampaigns = (range: DateRange, query: ListQuery) =>
  engageResource<CampaignsPayload>('campaigns', range, listParams(query))
export const fetchProfiles = (range: DateRange, query: ListQuery) =>
  engageResource<ProfilesPayload>('profiles', range, listParams(query))
export const fetchSentEmails = (range: DateRange, query: ListQuery) =>
  engageResource<SentEmailsPayload>('sent-emails', range, listParams(query))

export async function fetchConfigStatus(): Promise<AdapterResult<ConfigStatus>> {
  return toResult(
    'Configuration',
    'The configuration endpoint is only available once the site is deployed to Netlify.',
    async () => {
      const response = await fetch('/.netlify/functions/config-status')
      if (!response.ok) throw new Error(`Configuration check failed (${response.status})`)
      return (await response.json()) as ConfigStatus
    },
  )
}
