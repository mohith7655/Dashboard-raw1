import { useMemo } from 'react'
import type {
  DateRange,
  LeadReport,
  TrafficMetrics,
  WooMetrics,
} from '../../lib/types'
import { LEAD_SOURCES } from '../../lib/types'
import { daysInRange, includesToday } from '../../lib/dateRange'
import { deltaPct } from '../../lib/derive'
import { formatComparison, formatDecimal, formatPercent } from '../../lib/format'
import { FigureBox, type FigureBoxData } from '../FigureBox'
import { Skeleton } from '../Skeleton'

interface FunnelStatsCardProps {
  woo: WooMetrics | undefined
  traffic: TrafficMetrics | undefined
  leads: LeadReport | undefined
  range: DateRange
  /** The window each figure is compared against, or null when comparison is off. */
  against: DateRange | null
  loading: boolean
}

/**
 * The three rates the day is actually judged on, under the spend that bought
 * them.
 *
 * The card above says what advertising cost; these say what it produced — how
 * many orders a day that came to, the share of arrivals who bought, and the
 * share who at least left an address. All three survive a change in the length
 * of the period, which the totals either side of them do not, so they are the
 * figures that answer "is this normal" rather than "how much".
 *
 * Read outward from the sale: the orders a day is the figure the day is
 * settled on, the conversion rate is what produced it, and the lead rate is
 * what feeds that in turn.
 *
 * Two lines each, in the same grammar the revenue rows use: the figure with
 * its percentage, then the baseline that percentage was struck against and the
 * move in the figure's own unit. Both halves of the second line come from
 * formatComparison off a single value, so the move is always this figure less
 * the baseline printed beside it.
 *
 * A figure whose source has not answered is left out rather than shown as
 * nought: no analytics provider means an unknown conversion rate, not one of
 * zero, and the same goes for a leads sheet that has stopped writing.
 */
export function FunnelStatsCard({
  woo,
  traffic,
  leads,
  range,
  against,
  loading,
}: FunnelStatsCardProps) {
  const figures = useMemo((): FigureBoxData[] => {
    const out: FigureBoxData[] = []

    /* ---------------------------- Orders per day --------------------------- */
    if (woo) {
      const days = daysInRange(range)
      // Divided by the comparison window's own length, not this one's. The two
      // are equal under the default comparison but not under "same month last
      // year", where one divisor for both would report growth that never was.
      const priorDays = against ? daysInRange(against) : null
      const perDay = woo.totalOrders.value / days
      const before =
        woo.totalOrders.previous == null || priorDays === null
          ? null
          : woo.totalOrders.previous / priorDays

      /*
       * With today in the range the last day is a part-day, and the divisor
       * treats it as a whole one — so the figure runs low, by more the earlier
       * in the day it is read. The Today toggle on the row above is what
       * removes it, and the label says so rather than a third line under the
       * box: these read as one band with the ad-spend boxes beside them, and
       * only where every row is the same height.
       */
      out.push({
        label: includesToday(range) ? 'Orders / day (to date)' : 'Orders / day',
        value: formatDecimal(perDay),
        change: before === null ? null : deltaPct(perDay, before),
        ...formatComparison({ value: perDay, previous: before }, formatDecimal),
      })
    }

    /* --------------------------- Conversion rate --------------------------- */
    if (traffic && traffic.available) {
      out.push({
        label: 'Conversion',
        value: formatPercent(traffic.conversionRate.value),
        change: traffic.conversionRate.deltaPct,
        ...formatComparison(traffic.conversionRate, formatPercent),
      })
    }

    /* ------------------------------ Lead rate ------------------------------ */
    // Only where the provider is connected and somebody actually arrived. A
    // rate struck against nought visitors is not a rate.
    const visitors =
      traffic && traffic.available && traffic.visitors.value > 0
        ? traffic.visitors.value
        : null
    const visitorsBefore =
      traffic && traffic.visitors.previous ? traffic.visitors.previous : null

    if (leads && visitors !== null) {
      const captured = LEAD_SOURCES.reduce(
        (sum, key) => sum + leads.sources[key].count.value,
        0,
      )
      // The baseline needs every source to carry one. Summing the two that do
      // and comparing that against three sources' worth of this period would
      // report a move that is really just a source appearing.
      const priors = LEAD_SOURCES.map((key) => leads.sources[key].count.previous)
      const capturedBefore = priors.every((p) => p !== null && p !== undefined)
        ? (priors as number[]).reduce((sum, p) => sum + p, 0)
        : null

      const rate = captured / visitors
      const before =
        capturedBefore === null || visitorsBefore === null || visitorsBefore === 0
          ? null
          : capturedBefore / visitorsBefore

      out.push({
        label: 'Lead rate',
        value: formatPercent(rate),
        change: before === null ? null : deltaPct(rate, before),
        ...formatComparison({ value: rate, previous: before }, formatPercent),
      })
    }

    return out
  }, [woo, traffic, leads, range, against])

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        <Skeleton className="h-[80px] w-full" />
        <Skeleton className="h-[80px] w-full" />
        <Skeleton className="h-[80px] w-full" />
      </div>
    )
  }

  if (figures.length === 0) return null

  return (
    // Three across at every width, as the per-day strip in the CEO statement
    // is — on a phone these sit directly under the two ad-spend boxes, and a
    // row of three reads as one band with them rather than as a new section.
    <div className="grid grid-cols-3 gap-2">
      {figures.map((figure) => (
        <FigureBox key={figure.label} {...figure} />
      ))}
    </div>
  )
}
