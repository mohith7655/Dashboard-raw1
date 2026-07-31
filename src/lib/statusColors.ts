import type { OrderStatus } from './types'

/** Fixed status → colour map, shared by the pie chart and the table pills. */
export const STATUS_COLORS: Record<OrderStatus, string> = {
  cancelled: '#8a8a92',
  completed: '#22c55e',
  failed: '#ef4444',
  'on-hold': '#eab308',
  processing: '#3b82f6',
  refunded: '#f43f5e',
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  cancelled: 'Cancelled',
  completed: 'Completed',
  failed: 'Failed',
  'on-hold': 'On-hold',
  processing: 'Processing',
  refunded: 'Refunded',
}
