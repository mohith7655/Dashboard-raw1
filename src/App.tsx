import { useMemo, useState } from 'react'
import { Megaphone, Percent, TrendingUp } from 'lucide-react'
import { Header } from './components/Header'
import { KpiCard } from './components/KpiCard'
import { ErrorBanner } from './components/ErrorBanner'
import { FacebookGlyph, GoogleGlyph } from './components/SectionLabel'
import { DashboardTabs } from './components/DashboardTabs'
import { WooCommerceSection } from './components/sections/WooCommerceSection'
import { ProfitSummaryCard } from './components/sections/ProfitSummaryCard'
import { CouponUsageCard } from './components/sections/CouponUsageCard'
import { AdsSection } from './components/sections/AdsSection'
import { AdSpendSection } from './components/sections/AdSpendSection'
import { MarketsSection } from './components/sections/MarketsSection'
import { ProfitLossSection } from './components/sections/ProfitLossSection'
import { ShippingSection } from './components/sections/ShippingSection'
import { TrafficSection } from './components/sections/TrafficSection'
import { InsightsSection } from './components/sections/InsightsSection'
import { RevenueOverTime } from './components/charts/RevenueOverTime'
import { OrdersByStatus } from './components/charts/OrdersByStatus'
import { RevenueByTrafficSource } from './components/charts/RevenueByTrafficSource'
import { RecentOrders } from './components/RecentOrders'
import {
  DEFAULT_COMPARISON,
  formatRangeLabel,
  rangeFromPreset,
  resolveComparison,
} from './lib/dateRange'
import { buildSnapshot } from './lib/insightsSnapshot'
import { blendedAds, combinedAds } from './lib/pnl'
import { formatPercent, formatRoas } from './lib/format'
import { costLines } from './lib/operatingCosts'
import type { DashboardView } from './lib/navigation'
import {
  useGoogleAdsMetrics,
  useInsights,
  useMetaMetrics,
  useOperatingCosts,
  useOrders,
  useSaveOperatingCosts,
  useGa4Report,
  useTrafficMetrics,
  useWooMetrics,
} from './lib/queries'
import { COUPON_OVERVIEW_QUERY, useCoupons } from './lib/resourceQueries'
import type {
  AdsMetrics,
  Comparison,
  DateRange,
  Ga4Dimension,
  OrderSortField,
  SortDirection,
  SourceError,
} from './lib/types'

const PER_PAGE = 10

export default function App() {
  const [range, setRange] = useState<DateRange>(() => rangeFromPreset('thisMonth'))
  const [comparison, setComparison] = useState<Comparison>(DEFAULT_COMPARISON)
  const [view, setView] = useState<DashboardView>('overview')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<OrderSortField>('date')
  const [direction, setDirection] = useState<SortDirection>('desc')
  const [dismissed, setDismissed] = useState<string[]>([])
  const [ga4Dimension, setGa4Dimension] = useState<Ga4Dimension>('country')

  // Resolved once here rather than inside each hook: the modes are relative to
  // the range, so every source has to be asking about the same window.
  const against = useMemo(
    () => resolveComparison(range, comparison),
    [range, comparison],
  )

  const woo = useWooMetrics(range, against)
  const meta = useMetaMetrics(range, against)
  const google = useGoogleAdsMetrics(range, against)
  const orders = useOrders(range, { page, perPage: PER_PAGE, sort, direction })
  const costs = useOperatingCosts()
  const saveCosts = useSaveOperatingCosts()
  const coupons = useCoupons(range, COUPON_OVERVIEW_QUERY, against)
  const traffic = useTrafficMetrics(range, against)
  const ga4 = useGa4Report(range, ga4Dimension)
  const insights = useInsights()

  // Every connector has answered one way or the other. Analysing before this
  // would describe a half-loaded period and read the gaps as zeroes.
  const connectorsSettled =
    !woo.isLoading &&
    !meta.isLoading &&
    !google.isLoading &&
    !traffic.isLoading &&
    !ga4.isLoading &&
    !costs.isLoading

  const runAnalysis = () => {
    insights.analyse(
      buildSnapshot({
        range,
        woo,
        meta,
        google,
        traffic,
        ga4,
        costLines: costLines(costs.data ?? [], range),
      }),
    )
  }

  const onRangeChange = (next: DateRange) => {
    setRange(next)
    setPage(1)
    setDismissed([])
  }

  const onSortChange = (field: OrderSortField) => {
    if (field === sort) {
      setDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSort(field)
      setDirection('desc')
    }
    setPage(1)
  }

  // One banner per failed connector. Orders share Metorik's banner rather than
  // stacking a second copy of the same failure.
  const banners = useMemo(() => {
    const found: { key: string; error: SourceError; retry: () => void }[] = []
    if (woo.error) {
      found.push({
        key: 'metorik',
        error: woo.error,
        retry: () => {
          woo.refetch()
          orders.refetch()
        },
      })
    } else if (orders.error) {
      found.push({ key: 'metorik', error: orders.error, retry: orders.refetch })
    }
    if (meta.error) found.push({ key: 'meta', error: meta.error, retry: meta.refetch })
    if (google.error) {
      found.push({ key: 'google', error: google.error, retry: google.refetch })
    }
    return found.filter((b) => !dismissed.includes(b.key))
  }, [woo, meta, google, orders, dismissed])

  const retrying = (key: string): boolean => {
    if (key === 'metorik') return woo.isFetching || orders.isFetching
    if (key === 'meta') return meta.isFetching
    return google.isFetching
  }

  // Only platforms that answered. A connector that failed is left out entirely
  // so the derived views never read its silence as zero spend.
  const reportedAds = useMemo(() => {
    const found: { name: string; metrics: AdsMetrics }[] = []
    if (meta.data) found.push({ name: 'Facebook Meta Ads', metrics: meta.data })
    if (google.data) found.push({ name: 'Google Ads', metrics: google.data })
    return found
  }, [meta.data, google.data])

  const adsLoading = meta.isLoading || google.isLoading

  // Meta and Google as one account, plus the two figures that only mean
  // anything once spend is set against store revenue.
  const combined = useMemo(() => combinedAds(reportedAds), [reportedAds])
  const blended = useMemo(
    () => blendedAds(woo.data, reportedAds),
    [woo.data, reportedAds],
  )

  // Named rather than implied: with one connector down the totals are still
  // real, but they are not everything that was spent.
  const combinedScope =
    reportedAds.length > 1
      ? 'Facebook Meta Ads and Google Ads added together.'
      : reportedAds.length === 1
        ? `${reportedAds[0].name} only — the other platform did not report.`
        : ''


  return (
    <div className="min-h-screen bg-bg">
      <Header
        range={range}
        onRangeChange={onRangeChange}
        comparison={comparison}
        onComparisonChange={setComparison}
      />

      <main className="mx-auto max-w-[1280px] px-4 py-6">
        {banners.length > 0 && (
          <div className="mb-6 flex flex-col gap-3">
            {banners.map((banner) => (
              <ErrorBanner
                key={banner.key}
                error={banner.error}
                onRetry={banner.retry}
                onDismiss={() => setDismissed((d) => [...d, banner.key])}
                retrying={retrying(banner.key)}
              />
            ))}
          </div>
        )}

        <DashboardTabs active={view} onChange={setView} />

        {view === 'profit' && (
          <ProfitLossSection
            woo={woo.data}
            reportedAds={reportedAds}
            loading={woo.isLoading || adsLoading}
            failed={!!woo.error}
            range={range}
            costs={costs.data}
            costsLoading={costs.isLoading}
            // A failed save matters more than a stale load: it is the message
            // that says the numbers on screen are not the stored ones.
            costsError={saveCosts.error ?? costs.error?.message ?? null}
            savingCosts={saveCosts.saving}
            onSaveCosts={saveCosts.save}
          />
        )}

        {view === 'shipping' && (
          <ShippingSection
            woo={woo.data}
            loading={woo.isLoading}
            failed={!!woo.error}
          />
        )}

        {view === 'traffic' && (
          <TrafficSection
            traffic={traffic.data}
            woo={woo.data}
            loading={traffic.isLoading || woo.isLoading}
            failed={!!traffic.error}
            wooFailed={!!woo.error}
            ga4={ga4.data}
            ga4Dimension={ga4Dimension}
            onGa4DimensionChange={setGa4Dimension}
            ga4Loading={ga4.isLoading}
            ga4Fetching={ga4.isFetching}
            ga4Error={ga4.error?.message ?? null}
          />
        )}

        {view === 'insights' && (
          <InsightsSection
            report={insights.report}
            onAnalyse={runAnalysis}
            running={insights.running}
            error={insights.error}
            ready={connectorsSettled}
            rangeLabel={formatRangeLabel(range)}
          />
        )}

        {view === 'markets' && (
          <MarketsSection
            woo={woo.data}
            loading={woo.isLoading}
            failed={!!woo.error}
          />
        )}

        {view === 'ads' && (
          <AdSpendSection
            woo={woo.data}
            reportedAds={reportedAds}
            loading={woo.isLoading || adsLoading}
            wooFailed={!!woo.error}
          />
        )}

        {view === 'overview' && (
          <div className="flex flex-col gap-8">
            <WooCommerceSection
              metrics={woo.data}
              loading={woo.isLoading}
              failed={!!woo.error}
              summary={
                // The statement names coupons as one line — a single figure
                // come off gross sales. Which codes that figure was, and
                // whether they are being reached for more than before, reads
                // directly beneath it.
                <div className="flex flex-col gap-4">
                  <ProfitSummaryCard
                    woo={woo.data}
                    reportedAds={reportedAds}
                    costs={costs.data}
                    range={range}
                    against={against}
                    loading={woo.isLoading || adsLoading || costs.isLoading}
                    failed={!!woo.error}
                  />
                  <CouponUsageCard
                    couponsUsed={coupons.data?.couponsUsed}
                    discountTotal={coupons.data?.discountTotal}
                    coupons={coupons.data?.topCoupons ?? []}
                    lapsedCodes={coupons.data?.lapsedCodes}
                    against={against}
                    loading={coupons.isLoading}
                    failed={!!coupons.error}
                  />
                </div>
              }
            />

            <AdsSection
              title="All Ads"
              glyph={<Megaphone size={14} className="text-muted" />}
              metrics={combined ?? undefined}
              loading={adsLoading}
              // Only when neither platform answered; one that did still has
              // real figures to show.
              failed={!adsLoading && !combined}
              subtitle={combinedScope}
              platforms={reportedAds}
              extra={
                <>
                  <KpiCard
                    label="Blended ROAS"
                    value={blended ? formatRoas(blended.blendedRoas) : '—'}
                    icon={TrendingUp}
                    loading={adsLoading || woo.isLoading}
                    unavailable={!blended || !!woo.error}
                  />
                  <KpiCard
                    label="Spend % of Revenue"
                    value={blended ? formatPercent(blended.shareOfRevenue) : '—'}
                    polarity="down-good"
                    icon={Percent}
                    loading={adsLoading || woo.isLoading}
                    unavailable={!blended || !!woo.error}
                  />
                </>
              }
            />

            <AdsSection
              title="Facebook Meta Ads"
              glyph={<FacebookGlyph />}
              metrics={meta.data}
              loading={meta.isLoading}
              failed={!!meta.error}
            />

            <AdsSection
              title="Google Ads"
              glyph={<GoogleGlyph />}
              metrics={google.data}
              loading={google.isLoading}
              failed={!!google.error}
            />

            <RevenueOverTime
              data={woo.data?.revenueSeries ?? []}
              loading={woo.isLoading}
              unavailable={woo.error ? 'Revenue data unavailable' : undefined}
            />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <OrdersByStatus
                data={woo.data?.ordersByStatus ?? []}
                loading={woo.isLoading}
                unavailable={woo.error ? 'Order status data unavailable' : undefined}
              />
              <RevenueByTrafficSource
                data={woo.data?.revenueBySource ?? []}
                loading={woo.isLoading}
                unavailable={woo.error ? 'Traffic source data unavailable' : undefined}
              />
            </div>

            <RecentOrders
              page={orders.data ?? null}
              sort={sort}
              direction={direction}
              onSortChange={onSortChange}
              onPageChange={setPage}
              loading={orders.isLoading}
              fetching={orders.isFetching}
              unavailable={orders.error ? 'Orders unavailable' : undefined}
            />
          </div>
        )}
      </main>
    </div>
  )
}
