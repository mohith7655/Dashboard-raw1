import { useMemo, useState } from 'react'
import { Header } from './components/Header'
import { ErrorBanner } from './components/ErrorBanner'
import { FacebookGlyph, GoogleGlyph, OpenAiGlyph } from './components/SectionLabel'
import { DashboardTabs } from './components/DashboardTabs'
import { WooCommerceSection } from './components/sections/WooCommerceSection'
import { ProfitSummaryCard } from './components/sections/ProfitSummaryCard'
import { CouponUsageCard } from './components/sections/CouponUsageCard'
import { AdsSection } from './components/sections/AdsSection'
import { AdsStatsCard } from './components/sections/AdsStatsCard'
import { AdSpendSection } from './components/sections/AdSpendSection'
import { MarketsTrafficSection } from './components/sections/MarketsTrafficSection'
import { ProfitLossSection } from './components/sections/ProfitLossSection'
import { ShippingSection } from './components/sections/ShippingSection'
import { InsightsSection } from './components/sections/InsightsSection'
import { SearchFeedSection } from './components/sections/SearchFeedSection'
import { MarkifactSection } from './components/sections/MarkifactSection'
import { RevenueBreakdownCard } from './components/sections/RevenueBreakdownCard'
import { TargetsSection } from './components/sections/TargetsSection'
import { RevenueAndRefunds } from './components/charts/RevenueAndRefunds'
import { TrafficAndOrders } from './components/charts/TrafficAndOrders'
import { OrdersByStatus } from './components/charts/OrdersByStatus'
import { RevenueByTrafficSource } from './components/charts/RevenueByTrafficSource'
import { RecentOrders } from './components/RecentOrders'
import {
  DEFAULT_COMPARISON,
  clampRangeToAvailable,
  formatRangeLabel,
  rangeFromPreset,
  resolveComparison,
} from './lib/dateRange'
import { buildSnapshot } from './lib/insightsSnapshot'
import { blendedAds, combinedAds } from './lib/pnl'
import { failedOrderCount } from './lib/derive'
import { costLines } from './lib/operatingCosts'
import type { DashboardView } from './lib/navigation'
import {
  useGoogleAdsMetrics,
  useInsights,
  useInsightsAutomation,
  useCustomerOrders,
  useSaveInsightsSchedule,
  useTargets,
  useSaveTargets,
  useTargetAdvice,
  useMetaMetrics,
  useOpenAiAdsMetrics,
  useOperatingCosts,
  useOrders,
  useSaveOperatingCosts,
  useShippingCosts,
  useShippingCharged,
  useSaveShippingCosts,
  useGa4Report,
  useMarkifact,
  useMerchantFeed,
  useSearchConsole,
  useTrafficMetrics,
  useWooMetrics,
} from './lib/queries'
import { COUPON_OVERVIEW_QUERY, useCoupons } from './lib/resourceQueries'
import type {
  AdsMetrics,
  Comparison,
  DateRange,
  Ga4Dimension,
  GscDimension,
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
  const [gscDimension, setGscDimension] = useState<GscDimension>('query')
  // Which buyer's history is open in the orders table. One at a time, so the
  // page never has ten histories in flight.
  const [openCustomer, setOpenCustomer] = useState<string | null>(null)

  // Resolved once here rather than inside each hook: the modes are relative to
  // the range, so every source has to be asking about the same window.
  const against = useMemo(
    () => resolveComparison(range, comparison),
    [range, comparison],
  )

  const woo = useWooMetrics(range, against)
  const meta = useMetaMetrics(range, against)
  const google = useGoogleAdsMetrics(range, against)
  const openai = useOpenAiAdsMetrics(range, against)
  const orders = useOrders(range, { page, perPage: PER_PAGE, sort, direction })
  const costs = useOperatingCosts()
  const saveCosts = useSaveOperatingCosts()
  const shippingCosts = useShippingCosts()
  const saveShippingCosts = useSaveShippingCosts()
  const coupons = useCoupons(range, COUPON_OVERVIEW_QUERY, against)
  // Postage charged is read one destination at a time, so the list is capped
  // and taken from the split the metrics payload already carries — and the
  // query stays idle until that arrives, and while another tab is open.
  const shippingCountries = useMemo(
    () =>
      view === 'shipping'
        ? (woo.data?.revenueByCountry ?? [])
            .filter((row) => row.key !== '(unknown)')
            .slice(0, 25)
            .map((row) => row.key)
            .sort()
        : [],
    [view, woo.data],
  )
  const shippingCharged = useShippingCharged(range, shippingCountries)
  const traffic = useTrafficMetrics(range, against)
  const ga4 = useGa4Report(range, ga4Dimension)
  // The country cut specifically, which the markets join needs whatever the
  // picker is showing. Keyed identically when the picker is on Country, so it
  // is the same cached query there rather than a second call.
  const ga4Countries = useGa4Report(range, 'country')
  // Both gated on their tab. Search Console is four upstream calls per view and
  // Merchant Center one; neither belongs on the bill of a dashboard whose
  // reader never opened the tab.
  const searchConsole = useSearchConsole(range, gscDimension, against, view === 'search')
  const merchantFeed = useMerchantFeed(view === 'search')
  const markifact = useMarkifact(view === 'markifact')
  const customerOrders = useCustomerOrders(range, openCustomer)
  const insights = useInsights()
  const automation = useInsightsAutomation()
  const saveSchedule = useSaveInsightsSchedule()
  const targets = useTargets()
  const saveTargets = useSaveTargets()
  const targetAdviser = useTargetAdvice()
  const failedOrders = failedOrderCount(woo.data)

  // Every connector has answered one way or the other. Analysing before this
  // would describe a half-loaded period and read the gaps as zeroes.
  const connectorsSettled =
    !woo.isLoading &&
    !meta.isLoading &&
    !google.isLoading &&
    !openai.isLoading &&
    !traffic.isLoading &&
    !ga4.isLoading &&
    !costs.isLoading

  // One builder for both: the report and a typed question must never be able
  // to describe different periods.
  const snapshotOf = () =>
    buildSnapshot({
      range,
      woo,
      meta,
      google,
      traffic,
      ga4,
      costLines: costLines(costs.data ?? [], range),
    })

  const runAnalysis = () => {
    // The range travels with the snapshot so the report can be filed knowing
    // which period it describes — it outlives the picker that produced it.
    insights.analyse(snapshotOf(), range)
  }

  const onRangeChange = (next: DateRange) => {
    // Clamped on the way in rather than at each reader, so nothing derived
    // from the range — prorated costs above all — is measured against days
    // that have not happened yet.
    setRange(clampRangeToAvailable(next))
    setPage(1)
    setDismissed([])
    setOpenCustomer(null)
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
    if (openai.error) {
      found.push({ key: 'openai', error: openai.error, retry: openai.refetch })
    }
    return found.filter((b) => !dismissed.includes(b.key))
  }, [woo, meta, google, openai, orders, dismissed])

  const retrying = (key: string): boolean => {
    if (key === 'metorik') return woo.isFetching || orders.isFetching
    if (key === 'meta') return meta.isFetching
    if (key === 'openai') return openai.isFetching
    return google.isFetching
  }

  // Only platforms that answered. A connector that failed is left out entirely
  // so the derived views never read its silence as zero spend.
  const reportedAds = useMemo(() => {
    const found: { name: string; metrics: AdsMetrics }[] = []
    if (meta.data) found.push({ name: 'Facebook Meta Ads', metrics: meta.data })
    if (google.data) found.push({ name: 'Google Ads', metrics: google.data })
    if (openai.data) found.push({ name: 'OpenAI Ads', metrics: openai.data })
    return found
  }, [meta.data, google.data, openai.data])

  const adsLoading = meta.isLoading || google.isLoading || openai.isLoading

  // Meta and Google as one account, plus the two figures that only mean
  // anything once spend is set against store revenue.
  const combined = useMemo(() => combinedAds(reportedAds), [reportedAds])
  const blended = useMemo(
    () => blendedAds(woo.data, reportedAds),
    [woo.data, reportedAds],
  )

  // Named rather than implied: with one connector down the totals are still
  // real, but they are not everything that was spent.
  // Named rather than implied: with a connector down the totals are still
  // real, but they are not everything that was spent. Listed rather than
  // hard-coded now that there are three of them.
  const combinedScope =
    reportedAds.length > 1
      ? `${reportedAds.map((p) => p.name).join(', ')} added together.`
      : reportedAds.length === 1
        ? `${reportedAds[0].name} only — the other platforms did not report.`
        : ''

  // Built once and mounted in two places — its own tab, and at the head of the
  // overview. One element rather than two copies of the props: the two would
  // drift, and a reader comparing the same section in two tabs would have no
  // way to tell which of them was current.
  const insightsSection = (
    <InsightsSection
      report={insights.report}
      onAnalyse={runAnalysis}
      running={insights.running}
      error={insights.error}
      ready={connectorsSettled}
      rangeLabel={formatRangeLabel(range)}
      getSnapshot={snapshotOf}
      automation={automation.data}
      automationLoading={automation.isLoading}
      automationError={saveSchedule.error ?? automation.error?.message ?? null}
      savingSchedule={saveSchedule.saving}
      onSaveSchedule={saveSchedule.save}
    />
  )

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
            charged={shippingCharged.data}
            chargedLoading={shippingCharged.isLoading}
            chargedFailed={!!shippingCharged.error}
            extraCosts={shippingCosts.data}
            extraLoading={shippingCosts.isLoading}
            extraError={saveShippingCosts.error ?? shippingCosts.error?.message ?? null}
            savingExtra={saveShippingCosts.saving}
            onSaveExtra={saveShippingCosts.save}
          />
        )}

        {view === 'search' && (
          <SearchFeedSection
            report={searchConsole.data}
            dimension={gscDimension}
            onDimensionChange={setGscDimension}
            loading={searchConsole.isLoading}
            fetching={searchConsole.isFetching}
            error={searchConsole.error?.message ?? null}
            feed={merchantFeed.data}
            feedLoading={merchantFeed.isLoading}
            feedError={merchantFeed.error?.message ?? null}
            rangeEnd={range.end}
          />
        )}

        {view === 'markifact' && (
          <MarkifactSection
            account={markifact.data}
            loading={markifact.isLoading}
            error={markifact.error?.message ?? null}
          />
        )}

        {view === 'insights' && insightsSection}

        {view === 'markets' && (
          <MarketsTrafficSection
            woo={woo.data}
            wooLoading={woo.isLoading}
            wooFailed={!!woo.error}
            traffic={traffic.data}
            trafficLoading={traffic.isLoading}
            trafficFailed={!!traffic.error}
            ga4={ga4.data}
            ga4Dimension={ga4Dimension}
            onGa4DimensionChange={setGa4Dimension}
            ga4Loading={ga4.isLoading}
            ga4Fetching={ga4.isFetching}
            ga4Error={ga4.error?.message ?? null}
            ga4Country={ga4Countries.data}
            ga4CountryLoading={ga4Countries.isLoading}
          />
        )}

        {view === 'ads' && (
          <AdSpendSection
            woo={woo.data}
            reportedAds={reportedAds}
            loading={woo.isLoading || adsLoading}
            wooFailed={!!woo.error}
            platformSections={
              <>
                <AdsSection
                  title="Facebook Meta Ads"
                  glyph={<FacebookGlyph />}
                  collapsible
                  metrics={meta.data}
                  loading={meta.isLoading}
                  failed={!!meta.error}
                />
                <AdsSection
                  title="Google Ads"
                  glyph={<GoogleGlyph />}
                  collapsible
                  metrics={google.data}
                  loading={google.isLoading}
                  failed={!!google.error}
                />
                <AdsSection
                  title="OpenAI Ads"
                  glyph={<OpenAiGlyph />}
                  collapsible
                  metrics={openai.data}
                  loading={openai.isLoading}
                  failed={!!openai.error}
                />
              </>
            }
          />
        )}

        {view === 'overview' && (
          <div className="flex flex-col gap-8">
            {/* Ahead of the figures rather than after them: the report is the
                one thing on the page that says what the figures mean, and a
                reader who scrolled past every card to reach it would already
                have formed the view it exists to correct. */}
            {insightsSection}

            <WooCommerceSection
              metrics={woo.data}
              loading={woo.isLoading}
              failed={!!woo.error}
              range={range}
              against={against}
              summary={
                <ProfitSummaryCard
                  woo={woo.data}
                  reportedAds={reportedAds}
                  costs={costs.data}
                  range={range}
                  against={against}
                  loading={woo.isLoading || adsLoading || costs.isLoading}
                  failed={!!woo.error}
                />
              }
              beforeStats={
                <AdsStatsCard
                  metrics={combined ?? undefined}
                  platforms={reportedAds}
                  blended={woo.error ? null : blended}
                  subtitle={combinedScope}
                  range={range}
                  against={against}
                  loading={adsLoading}
                />
              }
              footer={
                // The statement names coupons as one line — a single figure
                // come off gross sales. Which codes that figure was, and
                // whether they are being reached for more than before, closes
                // the section rather than interrupting it: it is a footnote to
                // both the statement and the order counts above it.
                <CouponUsageCard
                  couponsUsed={coupons.data?.couponsUsed}
                  discountTotal={
                    // The statement above reads its coupon figure off the order
                    // totals, which is the authority. Metorik's per-coupon
                    // report can leave a code's discount at zero, and a card
                    // that summed those would state a smaller total than the
                    // line it descends from.
                    woo.data ? { value: woo.data.pnl.discounts, deltaPct: null } : undefined
                  }
                  coupons={coupons.data?.topCoupons ?? []}
                  lapsedCodes={coupons.data?.lapsedCodes}
                  against={against}
                  loading={coupons.isLoading}
                  failed={!!coupons.error}
                />
              }
            />


            {/* One plot, two scales: a refund spike is read against the day
                that produced it without the smaller series flattening onto
                the axis. */}
            <RevenueAndRefunds
              revenue={woo.data?.revenueSeries ?? []}
              refunds={woo.data?.refundSeries ?? []}
              loading={woo.isLoading}
              unavailable={woo.error ? 'Revenue data unavailable' : undefined}
            />

            {/* The funnel behind the revenue above: who arrived, how many
                bought, at what rate, and what went back. */}
            <TrafficAndOrders
              traffic={traffic.data?.series ?? []}
              refunds={woo.data?.refundSeries ?? []}
              loading={traffic.isLoading || woo.isLoading}
              unavailable={
                traffic.error
                  ? 'Traffic data unavailable'
                  : traffic.data && !traffic.data.available
                    ? 'No analytics provider is connected'
                    : undefined
              }
            />

            {/* Directly under the plot it tabulates: the chart shows the shape
                of the period, this shows which day made it that shape. */}
            <RevenueBreakdownCard
              rows={woo.data?.dailyBreakdown ?? []}
              loading={woo.isLoading}
              unavailable={woo.error ? 'Revenue breakdown unavailable' : undefined}
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
              // Closed on the way out: the row it belonged to is not on the
              // next page, and an expansion under a different customer's name
              // would attribute one buyer's history to another.
              onPageChange={(next) => {
                setPage(next)
                setOpenCustomer(null)
              }}
              loading={orders.isLoading}
              fetching={orders.isFetching}
              unavailable={orders.error ? 'Orders unavailable' : undefined}
              failedOrders={failedOrders}
              openEmail={openCustomer}
              onOpenEmail={setOpenCustomer}
              history={customerOrders.data}
              historyLoading={customerOrders.isLoading}
              historyError={customerOrders.error?.message ?? null}
            />

            {/* Last on the tab because it is the one section that reads
                forward. Everything above reports the period; this divides a
                goal by what the period actually achieved, which only means
                something once those figures have been seen.

                The feed is passed as whatever the Search & Feed tab has
                already loaded — undefined here on a first visit. It is not
                fetched for this section: a disapproval note is worth having
                when it is free and not worth an upstream call when it is not. */}
            <TargetsSection
              targets={targets.data}
              loading={targets.isLoading}
              error={saveTargets.error ?? targets.error?.message ?? null}
              saving={saveTargets.saving}
              onSave={saveTargets.save}
              woo={woo.data}
              blended={woo.error ? null : blended}
              feed={merchantFeed.data}
              range={range}
              adviser={targetAdviser}
              getSnapshot={snapshotOf}
            />
          </div>
        )}
      </main>
    </div>
  )
}
