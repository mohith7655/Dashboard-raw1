import { useMemo, useState } from 'react'
import { ErrorBanner } from '../components/ErrorBanner'
import { FacebookGlyph, GoogleGlyph } from '../components/SectionLabel'
import { DashboardTabs } from '../components/DashboardTabs'
import { WooCommerceSection } from '../components/sections/WooCommerceSection'
import { ProfitSummaryCard } from '../components/sections/ProfitSummaryCard'
import { CouponUsageCard } from '../components/sections/CouponUsageCard'
import { AdsSection } from '../components/sections/AdsSection'
import { AdsStatsCard } from '../components/sections/AdsStatsCard'
import { AdSpendSection } from '../components/sections/AdSpendSection'
import { ProfitLossSection } from '../components/sections/ProfitLossSection'
import { ShippingSection } from '../components/sections/ShippingSection'
import { RevenueOverTime } from '../components/charts/RevenueOverTime'
import { OrdersByStatus } from '../components/charts/OrdersByStatus'
import { RevenueByTrafficSource } from '../components/charts/RevenueByTrafficSource'
import { RecentOrders } from '../components/RecentOrders'
import { useRange } from '../lib/rangeContext'
import { blendedAds, combinedAds } from '../lib/pnl'
import { failedOrderCount } from '../lib/derive'
import type { DashboardView } from '../lib/navigation'
import {
  useGoogleAdsMetrics,
  useMetaMetrics,
  useOperatingCosts,
  useOrders,
  useSaveOperatingCosts,
  useShippingCosts,
  useSaveShippingCosts,
  useWooMetrics,
} from '../lib/queries'
import { COUPON_OVERVIEW_QUERY, useCoupons } from '../lib/resourceQueries'
import type {
  AdsMetrics,
  OrderSortField,
  SortDirection,
  SourceError,
} from '../lib/types'

const PER_PAGE = 10

export function DashboardPage() {
  const { range, against } = useRange()
  const [view, setView] = useState<DashboardView>('overview')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<OrderSortField>('date')
  const [direction, setDirection] = useState<SortDirection>('desc')
  const [dismissed, setDismissed] = useState<string[]>([])

  const woo = useWooMetrics(range, against)
  const meta = useMetaMetrics(range, against)
  const google = useGoogleAdsMetrics(range, against)
  const orders = useOrders(range, { page, perPage: PER_PAGE, sort, direction })
  const costs = useOperatingCosts()
  const saveCosts = useSaveOperatingCosts()
  const shippingCosts = useShippingCosts()
  const saveShippingCosts = useSaveShippingCosts()
  const coupons = useCoupons(range, COUPON_OVERVIEW_QUERY, against)
  const failedOrders = failedOrderCount(woo.data)

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
    <>
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
          // This page is not mounted; App.tsx carries the live wiring. The
          // per-country postage query lives there with it, so the table here
          // renders the paid side alone rather than a second copy of the call.
          charged={undefined}
          chargedLoading={false}
          chargedFailed={false}
          extraCosts={shippingCosts.data}
          extraLoading={shippingCosts.isLoading}
          extraError={saveShippingCosts.error ?? shippingCosts.error?.message ?? null}
          savingExtra={saveShippingCosts.saving}
          onSaveExtra={saveShippingCosts.save}
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
                // This page is not mounted; App.tsx carries the live wiring,
                // including the control that folds the statement.
                statementOpen
                statementId="dashboard-page-statement"
              />
            }
            beforeStats={
              <AdsStatsCard
                metrics={combined ?? undefined}
                platforms={reportedAds}
                blended={woo.error ? null : blended}
                subtitle={combinedScope}
                loading={adsLoading}
              />
            }
            footer={
              // The statement names coupons as one line — a single figure come
              // off gross sales. Which codes that figure was, and whether they
              // are being reached for more than before, closes the section: it
              // is a footnote to both the statement and the order counts above.
              <CouponUsageCard
                couponsUsed={coupons.data?.couponsUsed}
                discountTotal={
                  // The statement above reads its coupon figure off the order
                  // totals, which is the authority. Metorik's per-coupon report
                  // can leave a code's discount at zero, and a card that summed
                  // those would state a smaller total than the line it
                  // descends from.
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
            failedOrders={failedOrders}
          />
        </div>
      )}
    </>
  )
}
