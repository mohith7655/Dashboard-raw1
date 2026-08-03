import { useMemo, useState } from 'react'
import { Header } from './components/Header'
import { ErrorBanner } from './components/ErrorBanner'
import { FacebookGlyph, GoogleGlyph } from './components/SectionLabel'
import { DashboardTabs } from './components/DashboardTabs'
import { WooCommerceSection } from './components/sections/WooCommerceSection'
import { AdsSection } from './components/sections/AdsSection'
import { AdSpendSection } from './components/sections/AdSpendSection'
import { MarketsSection } from './components/sections/MarketsSection'
import { ProfitLossSection } from './components/sections/ProfitLossSection'
import { ShippingSection } from './components/sections/ShippingSection'
import { TrafficSection } from './components/sections/TrafficSection'
import { RevenueOverTime } from './components/charts/RevenueOverTime'
import { OrdersByStatus } from './components/charts/OrdersByStatus'
import { RevenueByTrafficSource } from './components/charts/RevenueByTrafficSource'
import { RecentOrders } from './components/RecentOrders'
import { rangeFromPreset } from './lib/dateRange'
import type { DashboardView } from './lib/navigation'
import {
  useGoogleAdsMetrics,
  useMetaMetrics,
  useOperatingCosts,
  useOrders,
  useSaveOperatingCosts,
  useTrafficMetrics,
  useWooMetrics,
} from './lib/queries'
import type {
  AdsMetrics,
  DateRange,
  OrderSortField,
  SortDirection,
  SourceError,
} from './lib/types'

const PER_PAGE = 10

export default function App() {
  const [range, setRange] = useState<DateRange>(() => rangeFromPreset('thisMonth'))
  const [view, setView] = useState<DashboardView>('overview')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<OrderSortField>('date')
  const [direction, setDirection] = useState<SortDirection>('desc')
  const [dismissed, setDismissed] = useState<string[]>([])

  const woo = useWooMetrics(range)
  const meta = useMetaMetrics(range)
  const google = useGoogleAdsMetrics(range)
  const orders = useOrders(range, { page, perPage: PER_PAGE, sort, direction })
  const costs = useOperatingCosts()
  const saveCosts = useSaveOperatingCosts()
  const traffic = useTrafficMetrics(range)

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

  return (
    <div className="min-h-screen bg-bg">
      <Header range={range} onRangeChange={onRangeChange} />

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
