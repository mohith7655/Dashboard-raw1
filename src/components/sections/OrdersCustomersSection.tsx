import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type {
  DateRange,
  LeadReport,
  TrafficMetrics,
  WooMetrics,
} from '../../lib/types'
import { SectionLabel } from '../SectionLabel'
import { FunnelStatsCard } from './FunnelStatsCard'
import { StoreStatsCard } from './StoreStatsCard'

interface OrdersCustomersSectionProps {
  metrics: WooMetrics | undefined
  loading: boolean
  failed: boolean
  /** The selected period, for the figures measured per day of it. */
  range: DateRange
  /** The window those are compared against, or null when comparison is off. */
  against: DateRange | null
  /** Counted on the rows, and the numerator under the lead rate. */
  leads: LeadReport | undefined
  /** The denominator under both rates. */
  traffic: TrafficMetrics | undefined
  trafficLoading: boolean
}

/**
 * Who bought, how often, and the rates that implies.
 *
 * Its own section rather than the last card of the CEO Dashboard. What is on
 * it counts people rather than money, and the questions it answers — are we
 * getting more customers, do they come back, what share of arrivals buy — are
 * asked separately from what the period earned.
 *
 * Three rates lead and the rows fold behind them. The rates are what survives
 * a change in the length of the period and what a reader checks daily; the
 * counts underneath are what they open when one of the three looks wrong. Put
 * the other way round, fourteen rows stood between the heading and the figures
 * most readings actually wanted.
 */
export function OrdersCustomersSection({
  metrics,
  loading,
  failed,
  range,
  against,
  leads,
  traffic,
  trafficLoading,
}: OrdersCustomersSectionProps) {
  const [open, setOpen] = useState(false)
  const bodyId = useId()

  return (
    <section>
      {/* The whole row opens it, as the All ads title does — the chevron sits
          out on the right rather than tucked against the label, so the target
          is the row and not three words of it. */}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="group flex w-full items-center justify-between gap-3 text-left"
      >
        <SectionLabel size="lg">Orders &amp; Customers</SectionLabel>
        <span className="mb-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors group-hover:bg-btn group-hover:text-ink">
          <ChevronDown
            size={15}
            className={`transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </span>
      </button>

      <div className="flex flex-col gap-4">
        <FunnelStatsCard
          woo={metrics}
          traffic={traffic}
          leads={leads}
          range={range}
          against={against}
          loading={loading || trafficLoading}
        />

        {/* Kept mounted and hidden rather than unmounted, so opening it does
            not re-run the row building on every press. */}
        <div id={bodyId} hidden={!open}>
          <StoreStatsCard
            metrics={metrics}
            range={range}
            against={against}
            leads={leads}
            traffic={traffic}
            loading={loading}
            failed={failed}
          />
        </div>
      </div>
    </section>
  )
}
