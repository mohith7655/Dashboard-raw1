import { Users } from 'lucide-react'
import type {
  DateRange,
  LeadReport,
  OrderStatus,
  TrafficMetrics,
  WooMetrics,
} from '../../lib/types'
import { LEAD_SOURCES, LEAD_SOURCE_LABELS } from '../../lib/types'
import { daysInRange } from '../../lib/dateRange'
import { deltaPct, failedOrderCount } from '../../lib/derive'
import {
  formatComparison,
  formatCurrency,
  formatInteger,
  formatPercent,
} from '../../lib/format'
import { StatRows, type StatRowData } from '../StatRows'
import { Skeleton } from '../Skeleton'

interface StoreStatsCardProps {
  metrics: WooMetrics | undefined
  /** The selected period, for the figures measured per day of it. */
  range: DateRange
  /** The window those are compared against, or null when comparison is off. */
  against: DateRange | null
  /**
   * Leads captured in the period, from the sheet the Make.com automations
   * write into. Undefined while loading or where that source failed — the
   * lead rows are simply left off rather than shown as zero.
   */
  leads: LeadReport | undefined
  /**
   * Traffic for the same period, needed for the one figure a lead count cannot
   * give on its own: the share of arrivals that left an address.
   */
  traffic: TrafficMetrics | undefined
  loading: boolean
  failed: boolean
}

/**
 * Who bought and how often, in the statement's own grammar.
 *
 * These were four KPI tiles under the statement, which made the section read
 * as a document followed by a scoreboard of the same period. Set as rows they
 * carry the same columns — figure, share, change — and the eye reads down one
 * column instead of hopping between cards.
 */
export function StoreStatsCard({
  metrics,
  range,
  against,
  leads,
  traffic,
  loading,
  failed,
}: StoreStatsCardProps) {
  const rows = metrics ? buildRows(metrics, range, against, leads, traffic) : []

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <div className="kpi-label truncate">Orders and customers</div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-icon-btn text-muted">
          <Users size={15} strokeWidth={2} />
        </span>
      </div>

      {loading ? (
        <div className="mt-3 flex flex-col gap-2 border-t border-row-line pt-3">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-full" />
        </div>
      ) : failed || rows.length === 0 ? (
        <p className="mt-3 border-t border-row-line pt-3 text-[12px] text-muted">
          Store data unavailable for this period.
        </p>
      ) : (
        <StatRows rows={rows} />
      )}
    </div>
  )
}

function buildRows(
  metrics: WooMetrics,
  range: DateRange,
  against: DateRange | null,
  leads: LeadReport | undefined,
  traffic: TrafficMetrics | undefined,
): StatRowData[] {
  /** The baseline and the move to it, as `formatComparison` returns them. */
  type Comparison = { previous?: string; difference?: string }

  const total = (
    label: string,
    value: string,
    change: number | null,
    cmp: Comparison = {},
  ): StatRowData => ({ label, value, kind: 'total', share: null, change, ...cmp })

  const part = (
    label: string,
    count: number,
    of: number,
    change: number | null,
    cmp: Comparison = {},
  ): StatRowData => ({
    label,
    value: formatInteger(count),
    kind: 'part',
    share: of ? count / of : 0,
    change,
    ...cmp,
  })

  // Per day of the period, and compared against the other window's own length.
  // The two are equal under the default comparison but not under "same month
  // last year", where one divisor for both would report growth that never was.
  const was = metrics.pnlPrevious
  const perDay = metrics.totalRevenue.value / daysInRange(range)
  const perDayBefore = was && against ? was.totalRevenue / daysInRange(against) : null

  const buyers = metrics.totalCustomers.value
  // Against every order placed, not against the paid ones the row above counts
  // — a failed order is precisely one that never joined them.
  const placed = metrics.orderCount
  const failed = failedOrderCount(metrics) ?? 0

  return [
    total(
      'Customers',
      formatInteger(buyers),
      metrics.totalCustomers.deltaPct,
      formatComparison(metrics.totalCustomers, formatInteger),
    ),
    part(
      'New',
      metrics.newCustomers.value,
      buyers,
      metrics.newCustomers.deltaPct,
      formatComparison(metrics.newCustomers, formatInteger),
    ),
    part(
      'Returning',
      metrics.returningCustomers.value,
      buyers,
      metrics.returningCustomers.deltaPct,
      formatComparison(metrics.returningCustomers, formatInteger),
    ),
    /*
     * The heading is every order placed, not the paid ones.
     *
     * `totalOrders` counts completed, processing and refunded — a failed order
     * is precisely one that never joined it — so it is not a total the parts
     * below can divide: taking 7 failures out of 158 paid orders would be
     * subtracting them from a figure they were never in. The count of orders
     * placed is the one that does divide, and it divides exactly.
     */
    total('Orders placed', formatInteger(placed), null),
    // The old `Total orders` row, to the digit: the paid statuses are what
    // this figure has always been. It keeps that row's baseline, which is the
    // only delta of the four — the status counts are held for the selected
    // period alone, so the rest have nothing to be measured against.
    part(
      'Processed',
      metrics.totalOrders.value,
      placed,
      metrics.totalOrders.deltaPct,
      formatComparison(metrics.totalOrders, formatInteger),
    ),
    { ...part('Failed', failed, placed, null), polarity: 'down-good' },
    // Whatever else the period holds, so the parts always add up to the
    // heading. Listed rather than assumed: a store that starts putting orders
    // on hold would otherwise leave a gap nothing on the card accounts for.
    ...otherStatuses(metrics, placed).map((row) => ({
      ...row,
      polarity: 'down-good' as const,
    })),
    total(
      'Avg order value',
      formatCurrency(metrics.avgOrderValue.value),
      metrics.avgOrderValue.deltaPct,
      formatComparison(metrics.avgOrderValue, formatCurrency),
    ),
    total(
      'Avg sales per day',
      formatCurrency(perDay),
      perDayBefore === null ? null : deltaPct(perDay, perDayBefore),
      perDayBefore === null
        ? {}
        : formatComparison({ value: perDay, previous: perDayBefore }, formatCurrency),
    ),
    ...leadRows(leads, traffic),
  ]
}

/**
 * Statuses that are neither paid nor already named on the card.
 *
 * `Processed` covers completed, processing and refunded; `Failed` is listed
 * outright because it is the one worth watching. Anything left — cancelled, on
 * hold — is rendered here so the parts sum to the orders placed above them. A
 * status with no orders in the period is dropped rather than shown as a zero.
 */
function otherStatuses(metrics: WooMetrics, placed: number): StatRowData[] {
  const named: OrderStatus[] = ['completed', 'processing', 'refunded', 'failed']

  return metrics.ordersByStatus
    .filter((row) => !named.includes(row.status) && row.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((row) => ({
      // Capitalised for the column it sits in; the API's own casing is lower.
      label: row.status.charAt(0).toUpperCase() + row.status.slice(1).replace('-', ' '),
      value: formatInteger(row.count),
      kind: 'part' as const,
      share: placed ? row.count / placed : 0,
      change: null,
    }))
}

/**
 * Leads, and the share of arrivals that became one.
 *
 * The card counted customers and orders — the two ends of the funnel — with
 * nothing about the step between them, where somebody gives an address without
 * buying. These rows sit under the sales figures rather than above them
 * because that is the order the funnel runs in from the store's point of view:
 * what it earned, then what it captured to earn from later.
 *
 * Left off entirely when the sheet has not answered. A zero here would read as
 * a period that captured nobody, which is a much stronger claim than "the
 * automation behind this has not reported".
 */
function leadRows(
  leads: LeadReport | undefined,
  traffic: TrafficMetrics | undefined,
): StatRowData[] {
  if (!leads) return []

  const total = LEAD_SOURCES.reduce(
    (sum, key) => sum + leads.sources[key].count.value,
    0,
  )

  // Only where the provider is actually connected and reported somebody. A
  // rate struck against zero visitors is not a rate.
  const visitors =
    traffic && traffic.available && traffic.visitors.value > 0
      ? traffic.visitors.value
      : null

  const rows: StatRowData[] = [
    {
      label: 'Leads',
      value: formatInteger(total),
      kind: 'total',
      share: null,
      // The sources it sums carry their own baselines and one of them can be
      // missing, which would make a combined delta compare a two-source total
      // against a three-source one.
      change: null,
      polarity: 'up-good',
    },
  ]

  for (const key of LEAD_SOURCES) {
    const { count } = leads.sources[key]
    rows.push({
      label: LEAD_SOURCE_LABELS[key],
      value: formatInteger(count.value),
      kind: 'part',
      share: total ? count.value / total : 0,
      change: count.deltaPct,
      ...formatComparison(count, formatInteger),
      polarity: 'up-good',
    })
  }

  if (visitors !== null) {
    rows.push({
      label: 'Lead rate',
      value: formatPercent(total / visitors),
      kind: 'total',
      share: null,
      // Struck from two figures that each carry their own baseline, so a delta
      // here would need both to be present and comparable. Left off rather
      // than computed from one of them.
      change: null,
      polarity: 'up-good',
    })
  }

  return rows
}
