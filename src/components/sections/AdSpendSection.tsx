import { Megaphone, Percent, ShoppingCart, TrendingUp } from 'lucide-react'
import type { AdsMetrics, WooMetrics } from '../../lib/types'
import { blendedAds } from '../../lib/pnl'
import {
  formatCurrency,
  formatInteger,
  formatPercent,
  formatRoas,
} from '../../lib/format'
import { KpiCard } from '../KpiCard'
import { SectionLabel } from '../SectionLabel'
import { Skeleton } from '../Skeleton'

interface AdSpendSectionProps {
  woo: WooMetrics | undefined
  /** Only platforms that answered — a failed one is absent, never zero. */
  reportedAds: { name: string; metrics: AdsMetrics }[]
  loading: boolean
  wooFailed: boolean
}

const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'

export function AdSpendSection({
  woo,
  reportedAds,
  loading,
  wooFailed,
}: AdSpendSectionProps) {
  const blended = blendedAds(woo, reportedAds)
  const shared = { loading, unavailable: wooFailed || !blended }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <SectionLabel>Ad Spend</SectionLabel>

        <div className={GRID}>
          <KpiCard
            label="Total Ad Spend"
            value={blended ? formatCurrency(blended.spend) : '—'}
            polarity="down-good"
            icon={Megaphone}
            {...shared}
          />
          <KpiCard
            label="Blended ROAS"
            value={blended ? formatRoas(blended.blendedRoas) : '—'}
            icon={TrendingUp}
            {...shared}
          />
          <KpiCard
            label="Spend % of Revenue"
            value={blended ? formatPercent(blended.shareOfRevenue) : '—'}
            polarity="down-good"
            icon={Percent}
            {...shared}
          />
          <KpiCard
            label="Ad Cost per Order"
            value={blended ? formatCurrency(blended.costPerOrder) : '—'}
            polarity="down-good"
            icon={ShoppingCart}
            {...shared}
          />
        </div>
      </div>

      <div className="card p-0">
        <div className="px-5 pb-4 pt-5">
          <h3 className="text-[15px] font-semibold text-ink">By platform</h3>
          <p className="mt-0.5 text-[12px] text-muted">
            Blended ROAS divides store revenue by spend; the per-platform figure is
            each platform&apos;s own attribution.
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col gap-3 px-5 pb-5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        ) : !blended ? (
          <div className="px-5 pb-6 text-[13px] text-muted">
            No ad platform reported for this period. Connect Meta or Google Ads to
            see spend here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line text-left">
                  <Th className="pl-5">Platform</Th>
                  <Th align="right">Spend</Th>
                  <Th align="right">ROAS</Th>
                  <Th align="right" className="pr-5">
                    Conversions
                  </Th>
                </tr>
              </thead>
              <tbody>
                {blended.platforms.map((platform) => (
                  <tr
                    key={platform.name}
                    className="border-b border-row-line last:border-0"
                  >
                    <Td className="pl-5 text-ink">{platform.name}</Td>
                    <Td align="right" className="tabular-nums text-ink">
                      {formatCurrency(platform.spend)}
                    </Td>
                    <Td align="right" className="tabular-nums text-muted">
                      {formatRoas(platform.roas)}
                    </Td>
                    <Td align="right" className="pr-5 tabular-nums text-muted">
                      {formatInteger(platform.conversions)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

function Th({
  children,
  align = 'left',
  className = '',
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
  className?: string
}) {
  return (
    <th
      scope="col"
      className={`px-3 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-label ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${className}`}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  align = 'left',
  className = '',
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
  className?: string
}) {
  return (
    <td
      className={`h-11 px-3 align-middle ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${className}`}
    >
      {children}
    </td>
  )
}
