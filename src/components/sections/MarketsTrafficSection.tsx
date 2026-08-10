import { Globe, Users } from 'lucide-react'
import type {
  Ga4Dimension,
  Ga4Report,
  TrafficMetrics,
  WooMetrics,
} from '../../lib/types'
import { countryRows, marketTrafficSummary } from '../../lib/marketTraffic'
import { countryName } from '../../lib/countries'
import {
  formatCurrency,
  formatInteger,
  formatPercent,
  formatPrevious,
} from '../../lib/format'
import { StatRows, type StatRowData } from '../StatRows'
import { SectionLabel } from '../SectionLabel'
import { Skeleton } from '../Skeleton'
import { MarketTable } from '../charts/MarketTable'
import { CountryFunnelTable } from '../charts/CountryFunnelTable'
import {
  ConversionRateOverTime,
  VisitorsOverTime,
} from '../charts/TrafficOverTime'
import { RevenueByTrafficSource } from '../charts/RevenueByTrafficSource'
import { Ga4BreakdownCard } from './Ga4BreakdownCard'

interface MarketsTrafficSectionProps {
  woo: WooMetrics | undefined
  wooLoading: boolean
  wooFailed: boolean
  traffic: TrafficMetrics | undefined
  trafficLoading: boolean
  trafficFailed: boolean
  /** The breakdown the picker is on — any dimension. */
  ga4: Ga4Report | undefined
  ga4Dimension: Ga4Dimension
  onGa4DimensionChange: (dimension: Ga4Dimension) => void
  ga4Loading: boolean
  ga4Fetching: boolean
  ga4Error: string | null
  /**
   * The country breakdown specifically, which the join needs whatever the
   * picker is showing. The same query when the picker is on Country, so it
   * costs nothing there.
   */
  ga4Country: Ga4Report | undefined
  ga4CountryLoading: boolean
}

/**
 * Where the money comes from and where the people come from, on one page.
 *
 * These were two tabs, and each held half of the only question worth asking of
 * either: a country's revenue means one thing beside ten visitors and quite
 * another beside ten thousand. Joined on country they answer it directly — the
 * table in the middle is the page, and everything above and below it is
 * context for reading a row.
 */
export function MarketsTrafficSection({
  woo,
  wooLoading,
  wooFailed,
  traffic,
  trafficLoading,
  trafficFailed,
  ga4,
  ga4Dimension,
  onGa4DimensionChange,
  ga4Loading,
  ga4Fetching,
  ga4Error,
  ga4Country,
  ga4CountryLoading,
}: MarketsTrafficSectionProps) {
  // A store with no analytics integration still answers 200, with every figure
  // zero. Treating that as real would put a 0% conversion rate beside a page of
  // live orders, so it is called out as missing instead.
  const connected = !traffic || traffic.available
  const rows = countryRows(woo, ga4Country)
  const summary = marketTrafficSummary(woo, rows, ga4Country)
  const currency = woo?.storeCurrency ?? 'store currency'

  const withVisitors = summary.visited !== null && summary.visited > 0

  return (
    <section className="flex flex-col gap-4">
      <SectionLabel>Markets &amp; Traffic</SectionLabel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TrafficCard
          traffic={traffic}
          woo={woo}
          loading={trafficLoading}
          failed={trafficFailed || !connected}
          wooFailed={wooFailed}
        />
        <MarketsCard
          summary={summary}
          currency={currency}
          loading={wooLoading}
          failed={wooFailed}
        />
      </div>

      {!connected && !trafficLoading && (
        <p className="text-[12px] leading-relaxed text-muted">
          No analytics provider is connected, so there are no visitor figures to
          set the countries below against — which is not the same as no traffic.
          Connect it under Metorik → Integrations → Google Analytics &amp; Ads.
        </p>
      )}

      <CountryFunnelTable
        rows={rows}
        withVisitors={withVisitors}
        loading={wooLoading || (ga4CountryLoading && rows.length === 0)}
        unavailable={wooFailed ? 'Country data unavailable' : undefined}
      />

      {/* The one line the join exists to produce, said outright rather than
          left to be read off the table. */}
      {withVisitors && summary.browsingOnly.length > 0 && (
        <p className="text-[12px] leading-relaxed text-muted">
          {formatInteger(summary.browsingOnly.length)}{' '}
          {summary.browsingOnly.length === 1 ? 'country' : 'countries'} sent{' '}
          {formatInteger(summary.browsingVisitors)} visitors and no orders at all
          — the largest{' '}
          {summary.browsingOnly
            .slice(0, 3)
            .map((row) => `${row.name} (${formatInteger(row.visitors ?? 0)})`)
            .join(', ')}
          .
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <VisitorsOverTime
          data={traffic?.series ?? []}
          loading={trafficLoading}
          unavailable={trafficFailed ? 'Visitor data unavailable' : undefined}
        />
        <ConversionRateOverTime
          data={traffic?.series ?? []}
          loading={trafficLoading}
          unavailable={trafficFailed ? 'Conversion data unavailable' : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <MarketTable
          title="Revenue by Currency"
          subtitle={`What buyers paid in, converted to ${currency}`}
          keyHeader="Currency"
          rows={woo?.revenueByCurrency ?? []}
          measure="revenue"
          loading={wooLoading}
          unavailable={wooFailed ? 'Currency data unavailable' : undefined}
        />
        <RevenueByTrafficSource
          data={woo?.revenueBySource ?? []}
          loading={wooLoading}
          unavailable={wooFailed ? 'Traffic source data unavailable' : undefined}
        />
      </div>

      <Ga4BreakdownCard
        report={ga4}
        dimension={ga4Dimension}
        onDimensionChange={onGa4DimensionChange}
        loading={ga4Loading}
        fetching={ga4Fetching}
        error={ga4Error}
      />

      {traffic?.visitorDefinition && connected && (
        <p className="text-[12px] leading-relaxed text-muted">
          {traffic.visitorDefinition}
          {traffic.providerMetric && ` (${traffic.providerMetric})`}. Orders and
          revenue come from the store, visitors from GA4, and the two count a
          country on different bases — the billing address against where the
          browser was — so a row reconciles in direction rather than to the
          penny.
        </p>
      )}
    </section>
  )
}

/* -------------------------------- Cards -------------------------------- */

function TrafficCard({
  traffic,
  woo,
  loading,
  failed,
  wooFailed,
}: {
  traffic: TrafficMetrics | undefined
  woo: WooMetrics | undefined
  loading: boolean
  failed: boolean
  wooFailed: boolean
}) {
  const visitors = traffic?.visitors.value ?? 0
  const rows: StatRowData[] = []

  if (traffic) {
    rows.push({
      label: 'Visitors',
      value: formatInteger(visitors),
      kind: 'total',
      share: null,
      change: traffic.visitors.deltaPct,
      previous: formatPrevious(traffic.visitors, formatInteger),
    })
    rows.push({
      label: 'Converting',
      value: formatInteger(traffic.orders.value),
      kind: 'part',
      // The share of visitors that bought — the conversion rate, stated where
      // it belongs rather than as a figure of its own.
      share: visitors === 0 ? 0 : traffic.orders.value / visitors,
      change: traffic.orders.deltaPct,
      previous: formatPrevious(traffic.orders, formatInteger),
    })
    rows.push({
      label: 'Conversion rate',
      value: formatPercent(traffic.conversionRate.value),
      kind: 'total',
      share: null,
      change: traffic.conversionRate.deltaPct,
      previous: formatPrevious(traffic.conversionRate, formatPercent),
    })
    if (woo && !wooFailed && visitors > 0) {
      rows.push({
        label: 'Revenue per visitor',
        value: formatCurrency(woo.totalRevenue.value / visitors),
        kind: 'total',
        share: null,
        change: null,
      })
    }
  }

  return (
    <StatCard
      label="Visitors and conversion"
      icon={<Users size={15} strokeWidth={2} />}
      rows={rows}
      loading={loading}
      failed={failed}
      empty="No analytics provider connected for this period."
    />
  )
}

function MarketsCard({
  summary,
  currency,
  loading,
  failed,
}: {
  summary: ReturnType<typeof marketTrafficSummary>
  currency: string
  loading: boolean
  failed: boolean
}) {
  const rows: StatRowData[] = []

  if (summary.selling > 0 || summary.visited !== null) {
    rows.push({
      label: 'Countries selling',
      value: formatInteger(summary.selling),
      kind: 'total',
      share: null,
      change: null,
    })
    if (summary.topCountry) {
      rows.push({
        label: `Top — ${countryName(summary.topCountry.key) || summary.topCountry.key}`,
        value: formatPercent(summary.topCountry.share),
        kind: 'part',
        share: null,
        change: null,
      })
    }
    if (summary.visited !== null) {
      rows.push({
        label: 'Countries visiting',
        value: formatInteger(summary.visited),
        kind: 'total',
        share: null,
        change: null,
      })
      rows.push({
        label: 'Browsing only',
        value: formatInteger(summary.browsingOnly.length),
        kind: 'part',
        share:
          summary.visited === 0 ? 0 : summary.browsingOnly.length / summary.visited,
        change: null,
        polarity: 'down-good',
      })
    }
    rows.push({
      label: 'Currencies billed',
      value: formatInteger(summary.currencies),
      kind: 'total',
      share: null,
      change: null,
    })
    rows.push({
      label: `Not ${currency}`,
      value: formatCurrency(summary.foreignRevenue),
      kind: 'part',
      share: summary.foreignShare,
      change: null,
    })
  }

  return (
    <StatCard
      label="Countries and currencies"
      icon={<Globe size={15} strokeWidth={2} />}
      rows={rows}
      loading={loading}
      failed={failed}
      empty="Store data unavailable for this period."
    />
  )
}

function StatCard({
  label,
  icon,
  rows,
  loading,
  failed,
  empty,
}: {
  label: string
  icon: React.ReactNode
  rows: StatRowData[]
  loading: boolean
  failed: boolean
  empty: string
}) {
  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <div className="kpi-label truncate">{label}</div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-icon-btn text-muted">
          {icon}
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
          {empty}
        </p>
      ) : (
        <StatRows rows={rows} />
      )}
    </div>
  )
}
