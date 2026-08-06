import type {
  AdapterResult,
  DateRange,
  OrdersPage,
  OrdersQuery,
  ShippingChargedPayload,
  TrafficMetrics,
  WooMetrics,
} from '../types'
import { callFunction, compareParams, toResult } from './client'

const SOURCE = 'Metorik'
const HINT =
  'WooCommerce metrics could not be loaded. Check the Metorik API key in your Netlify environment, then click Retry.'
const TRAFFIC_HINT =
  'Traffic comes from the analytics provider connected to Metorik. Check that integration, then click Retry.'
const SHIPPING_HINT =
  'Postage charged is read one destination at a time, so a single slow response can fail the set. Click Retry.'

export async function fetchMetrics(
  range: DateRange,
  against: DateRange | null,
): Promise<AdapterResult<WooMetrics>> {
  return toResult(SOURCE, HINT, () =>
    callFunction<WooMetrics>('metorik', range, compareParams(against)),
  )
}

export async function fetchTraffic(
  range: DateRange,
  against: DateRange | null,
): Promise<AdapterResult<TrafficMetrics>> {
  return toResult(SOURCE, TRAFFIC_HINT, () =>
    callFunction<TrafficMetrics>('metorik', range, {
      resource: 'traffic',
      ...compareParams(against),
    }),
  )
}

/**
 * Postage charged per destination, which only `/orders/totals` splits out and
 * only one country at a time.
 *
 * The country list is sent rather than rediscovered server-side: this page
 * already holds the split from the metrics payload, and sweeping every order
 * again purely to rebuild it would double the cost of opening the tab.
 */
export async function fetchShippingCharged(
  range: DateRange,
  countries: string[],
): Promise<AdapterResult<ShippingChargedPayload>> {
  return toResult(SOURCE, SHIPPING_HINT, () =>
    callFunction<ShippingChargedPayload>('metorik', range, {
      resource: 'shipping',
      countries: countries.join(','),
    }),
  )
}

export async function fetchOrders(
  range: DateRange,
  query: OrdersQuery,
): Promise<AdapterResult<OrdersPage>> {
  return toResult(SOURCE, HINT, () =>
    callFunction<OrdersPage>('metorik', range, {
      resource: 'orders',
      page: String(query.page),
      perPage: String(query.perPage),
      sort: query.sort,
      direction: query.direction,
    }),
  )
}
