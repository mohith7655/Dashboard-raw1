import { Users } from 'lucide-react'
import type {
  DateRange,
  LeadReport,
  TrafficMetrics,
  WooMetrics,
} from '../../lib/types'
import { LEAD_SOURCES, LEAD_SOURCE_LABELS } from '../../lib/types'
import { daysInRange } from '../../lib/dateRange'
import { deltaPct, failedOrderCount } from '../../lib/derive'
import {
  formatCurrency,
  formatInteger,
  formatPercent,
  formatPrevious,
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
  const total = (
    label: string,
    value: string,
    change: number | null,
    previous?: string,
  ): StatRowData => ({ label, value, kind: 'total', share: null, change, previous })

  const part = (
    label: string,
    count: number,
    of: number,
    change: number | null,
    previous?: string,
  ): StatRowData => ({
    label,
    value: formatInteger(count),
    kind: 'part',
    share: of ? count / of : 0,
    change,
    previous,
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
      formatPrevious(metrics.totalCustomers, formatInteger),
    ),
    part(
      'New',
      metrics.newCustomers.value,
      buyers,
      metrics.newCustomers.deltaPct,
      formatPrevious(metrics.newCustomers, formatInteger),
    ),
    part(
      'Returning',
      metrics.returningCustomers.value,
      buyers,
      metrics.returningCustomers.deltaPct,
      formatPrevious(metrics.returningCustomers, formatInteger),
    ),
    total(
      'Total orders',
      formatInteger(metrics.totalOrders.value),
      metrics.totalOrders.deltaPct,
      formatPrevious(metrics.totalOrders, formatInteger),
    ),
    // No delta: the status counts are only kept for the selected period, so
    // there is nothing to measure this against rather than nothing to report.
    { ...part('Failed', failed, placed, null), polarity: 'down-good' },
    total(
      'Avg order value',
      formatCurrency(metrics.avgOrderValue.value),
      metrics.avgOrderValue.deltaPct,
      formatPrevious(metrics.avgOrderValue, formatCurrency),
    ),
    total(
      'Avg sales per day',
      formatCurrency(perDay),
      perDayBefore === null ? null : deltaPct(perDay, perDayBefore),
      perDayBefore === null ? undefined : formatCurrency(perDayBefore),
    ),
    ...leadRows(leads, traffic),
  ]
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
      previous: formatPrevious(count, formatInteger),
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
