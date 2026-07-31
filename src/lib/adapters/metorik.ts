import type {
  AdapterResult,
  DateRange,
  Order,
  OrdersPage,
  OrdersQuery,
  WooMetrics,
} from '../types'
import { buildOrders, buildWooFixture } from '../fixtures'
import {
  USE_FIXTURES,
  callFunction,
  fixtureDelay,
  isSimulatedFailure,
  toResult,
} from './client'

const SOURCE = 'Metorik'
const HINT =
  'WooCommerce metrics could not be loaded. Check the Metorik API key in your Netlify environment, then click Retry.'

export async function fetchMetrics(range: DateRange): Promise<AdapterResult<WooMetrics>> {
  return toResult(SOURCE, HINT, async () => {
    if (USE_FIXTURES) {
      await fixtureDelay()
      if (isSimulatedFailure('metorik')) {
        throw new Error(
          'Metorik API error (401): Invalid API token. Please check your credentials.',
        )
      }
      return buildWooFixture(range)
    }
    return callFunction<WooMetrics>('metorik', range)
  })
}

export async function fetchOrders(
  range: DateRange,
  query: OrdersQuery,
): Promise<AdapterResult<OrdersPage>> {
  return toResult(SOURCE, HINT, async () => {
    if (USE_FIXTURES) {
      await fixtureDelay(250)
      if (isSimulatedFailure('metorik')) {
        throw new Error(
          'Metorik API error (401): Invalid API token. Please check your credentials.',
        )
      }
      return paginate(buildOrders(range), query)
    }
    return callFunction<OrdersPage>('metorik', range, {
      resource: 'orders',
      page: String(query.page),
      perPage: String(query.perPage),
      sort: query.sort,
      direction: query.direction,
    })
  })
}

/**
 * Fixture stand-in for the server-side pagination the function performs. The
 * client only ever receives one page either way.
 */
function paginate(orders: Order[], query: OrdersQuery): OrdersPage {
  const sign = query.direction === 'asc' ? 1 : -1
  const sorted = [...orders].sort((a, b) => {
    if (query.sort === 'total') return (a.total - b.total) * sign
    return (Date.parse(a.date) - Date.parse(b.date)) * sign
  })
  const start = (query.page - 1) * query.perPage
  return {
    orders: sorted.slice(start, start + query.perPage),
    total: orders.length,
    page: query.page,
    perPage: query.perPage,
  }
}
