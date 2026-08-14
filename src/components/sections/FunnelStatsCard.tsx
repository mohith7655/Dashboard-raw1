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
import { formatDecimal, formatInteger, formatPercent } from '../../lib/format'
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
 * The card above says what advertising cost; these say what it produced — the
 * share of arrivals who left an address, the share who bought, and how many
 * orders a day that came to. All three survive a change in the length of the
 * period, which the totals either side of them do not, so they are the figures
 * that answer "is this normal" rather than "how much".
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

    // Only where the provider is connected and somebody actually arrived. A
    // rate struck against nought visitors is not a rate.
    const visitors =
      traffic && traffic.available && traffic.visitors.value > 0
        ? traffic.visitors.value
        : null
    const visitorsBefore =
      traffic && traffic.visitors.previous ? traffic.visitors.previous : null

    /* ------------------------------ Lead rate ------------------------------ */
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
        previous: before === null ? undefined : formatPercent(before),
        note: `${formatInteger(captured)} of ${formatInteger(visitors)} visitors`,
      })
    }

    /* --------------------------- Conversion rate --------------------------- */
    if (traffic && traffic.available) {
      out.push({
        label: 'Conversion',
        value: formatPercent(traffic.conversionRate.value),
        change: traffic.conversionRate.deltaPct,
        previous:
          traffic.conversionRate.previous == null
            ? undefined
            : formatPercent(traffic.conversionRate.previous),
        note: `${formatInteger(traffic.orders.value)} orders from ${formatInteger(
          traffic.visitors.value,
        )} visitors`,
      })
    }

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
       * The day count is only claimed where every day in it is a whole one.
       *
       * With today counted the last day is a part-day, and the divisor above
       * still treats it as a full one — so the figure runs low, by more the
       * earlier in the day it is read. Printing "over 14 days" under it would
       * assert fourteen complete days of trading and make a soft figure look
       * measured. The note says what is actually in the range instead, and the
       * Today toggle on the row above is what removes the part-day.
       */
      out.push({
        label: 'Orders / day',
        value: formatDecimal(perDay),
        change: before === null ? null : deltaPct(perDay, before),
        previous: before === null ? undefined : formatDecimal(before),
        note: includesToday(range)
          ? `${formatInteger(woo.totalOrders.value)} so far, today part-counted`
          : `${formatInteger(woo.totalOrders.value)} over ${days} ${
              days === 1 ? 'day' : 'days'
            }`,
      })
    }

    return out
  }, [woo, traffic, leads, range, against])

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        <Skeleton className="h-[84px] w-full" />
        <Skeleton className="h-[84px] w-full" />
        <Skeleton className="h-[84px] w-full" />
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
