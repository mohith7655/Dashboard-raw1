import type { AdapterResult, DateRange, OrdersPage, OrdersQuery, WooMetrics } from '../types'
import { callFunction, toResult } from './client'

const SOURCE = 'Metorik'
const HINT =
  'WooCommerce metrics could not be loaded. Check the Metorik API key in your Netlify environment, then click Retry.'

export async function fetchMetrics(range: DateRange): Promise<AdapterResult<WooMetrics>> {
  return toResult(SOURCE, HINT, () => callFunction<WooMetrics>('metorik', range))
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
