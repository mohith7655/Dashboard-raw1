import { useState } from 'react'
import { ChevronDown, TrendingUp } from 'lucide-react'
import type { AdsMetrics, WooMetrics } from '../../lib/types'
import { blendedAds, nonAttributing } from '../../lib/pnl'
import {
  formatCurrency,
  formatInteger,
  formatPercent,
  formatRoas,
} from '../../lib/format'
import { StatRows, type StatRowData } from '../StatRows'
import { Skeleton } from '../Skeleton'

interface BlendedRoasCardProps {
  woo: WooMetrics | undefined
  /** Only platforms that answered — a failed one is absent, never zero. */
  reportedAds: { name: string; metrics: AdsMetrics }[]
  loading: boolean
  /** The store side failed, so there is no revenue to divide by. */
  wooFailed: boolean
}

/**
 * The one figure on this page that is a division rather than a subtraction,
 * with the division shown.
 *
 * Blended ROAS is store revenue over total ad spend — neither of which is on
 * the waterfall as a pair, and both of which come from different connectors.
 * A bare `2.4x` is therefore the least checkable number on the page: it is
 * either a triumph or an artefact of one platform failing to report, and the
 * two look identical. Closed it states the figure; opened it states both sides
 * of the fraction and every platform inside the denominator, so the reader can
 * see which it is.
 */
export function BlendedRoasCard({
  woo,
  reportedAds,
  loading,
  wooFailed,
}: BlendedRoasCardProps) {
  const [open, setOpen] = useState(false)
  const blended = wooFailed ? null : blendedAds(woo, reportedAds)
  const revenue = woo?.totalRevenue.value ?? 0
  const unattributed = nonAttributing(reportedAds)

  const rows: StatRowData[] = blended
    ? [
        // The fraction itself, numerator over denominator, before anything
        // derived from it. Shares are of revenue, so spend reads as the slice
        // of the money that went back out to buy it.
        {
          label: 'Store revenue',
          value: formatCurrency(revenue),
          kind: 'total',
          share: null,
          change: woo?.totalRevenue.deltaPct ?? null,
        },
        {
          label: 'Ad spend',
          value: formatCurrency(blended.spend),
          kind: 'total',
          share: revenue ? blended.spend / revenue : 0,
          change: null,
          polarity: 'down-good',
        },
        ...blended.platforms.map<StatRowData>((platform) => ({
          label: platform.name,
          value: formatCurrency(platform.spend),
          kind: 'part',
          share: blended.spend ? platform.spend / blended.spend : 0,
          change: null,
          polarity: 'down-good',
        })),
        {
          label: 'Blended ROAS',
          value: formatRoas(blended.blendedRoas),
          kind: 'total',
          share: null,
          change: null,
        },
        {
          label: 'Spend % of revenue',
          value: formatPercent(blended.shareOfRevenue),
          kind: 'total',
          share: null,
          change: null,
          polarity: 'down-good',
        },
        {
          label: 'Ad cost per order',
          value: formatCurrency(blended.costPerOrder),
          kind: 'total',
          share: null,
          change: null,
          polarity: 'down-good',
        },
        // Each platform's own claim, kept well away from the blended figure
        // above so the two are never read as versions of one number.
        ...blended.platforms.map<StatRowData>((platform) => ({
          label: `${platform.name} ROAS`,
          value: formatRoas(platform.roas),
          kind: 'part',
          share: null,
          change: null,
        })),
        ...blended.platforms.map<StatRowData>((platform) => ({
          label: `${platform.name} conversions`,
          value: formatInteger(platform.conversions),
          kind: 'part',
          share: null,
          change: null,
        })),
      ]
    : []

  return (
    <div className="card">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls="blended-roas-detail"
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="kpi-label truncate">Blended ROAS</div>
          <div className="mt-2 flex items-baseline gap-x-2">
            {loading ? (
              <Skeleton className="h-[30px] w-24" />
            ) : (
              <div className="kpi-value min-w-0 truncate">
                {blended ? formatRoas(blended.blendedRoas) : '—'}
              </div>
            )}
          </div>
          <p className="mt-1 text-[12px] text-muted">
            {loading
              ? 'Loading…'
              : blended
                ? `${formatCurrency(revenue)} revenue ÷ ${formatCurrency(
                    blended.spend,
                  )} spend — ${open ? 'hide the detail' : 'open for the detail'}`
                : 'No ad platform reported for this period.'}
          </p>
        </div>

        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-icon-btn text-muted">
          {open ? (
            <ChevronDown size={15} strokeWidth={2} className="rotate-180 transition-transform" />
          ) : (
            <TrendingUp size={15} strokeWidth={2} />
          )}
        </span>
      </button>

      <div id="blended-roas-detail" hidden={!open || rows.length === 0}>
        {open && rows.length > 0 && (
          <>
            <StatRows rows={rows} />
            <p className="mt-3 text-[12px] leading-relaxed text-muted">
              Blended ROAS divides the store&apos;s own revenue by every
              platform&apos;s spend, so it counts sales no platform claimed and
              never counts one sale twice. A platform&apos;s own ROAS is its
              attribution of its own spend; the two disagree by design.
              {unattributed.length > 0 && (
                <>
                  {' '}
                  {unattributed.join(' and ')} report no attributed conversions,
                  so their spend is in the denominator above while their own ROAS
                  reads as nothing earned.
                </>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
