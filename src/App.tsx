import { useId, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
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
import { LeadsSection } from './components/sections/LeadsSection'
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
  SectionRangeControl,
  useSectionRange,
  type SectionRange,
} from './components/SectionRange'
import {
  AnalyseButton,
  SectionAnalysis,
  type SectionAnalysisWiring,
} from './components/SectionAnalysis'
import {
  DEFAULT_COMPARISON,
  clampRangeToAvailable,
  withoutToday,
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
  useSectionAnalysis,
  useSectionPrompts,
  useSaveSectionPrompts,
  useLeads,
  useMerchantFeed,
  useSearchConsole,
  useTrafficMetrics,
  useWooMetrics,
} from './lib/queries'
import { COUPON_OVERVIEW_QUERY, useCoupons } from './lib/resourceQueries'
import { SECTION_LABELS } from './lib/types'
import type {
  AdsMetrics,
  Comparison,
  DateRange,
  Ga4Dimension,
  GscDimension,
  OrderSortField,
  SectionPromptKey,
  SortDirection,
  SourceError,
} from './lib/types'

const PER_PAGE = 10

/**
 * Which platforms a combined total actually covers.
 *
 * Struck from the list it describes rather than from the page's, because the
 * All ads card can be on a period of its own — and a platform that reported
 * for the page's month may have reported nothing in the card's week. A
 * subtitle naming platforms the figures above it do not include is worse than
 * no subtitle.
 */
function scopeOf(reported: { name: string }[]): string {
  if (reported.length > 1) {
    return `${reported.map((p) => p.name).join(', ')} added together.`
  }
  if (reported.length === 1) {
    return `${reported[0].name} only — the other platforms did not report.`
  }
  return ''
}

/**
 * Everything a section needs for a period of its own.
 *
 * The same four connectors the page uses, asked about the section's window.
 * Assembled here rather than inside each section so the combining — which
 * platforms count as reported, how they blend against revenue — is done once
 * and identically for both.
 */
function useScopedMetrics(scope: SectionRange) {
  const { range, against } = scope
  const woo = useWooMetrics(range, against)
  const meta = useMetaMetrics(range, against)
  const google = useGoogleAdsMetrics(range, against)
  const openai = useOpenAiAdsMetrics(range, against)

  // Only platforms that answered. A connector that failed is left out entirely
  // so the derived views never read its silence as zero spend.
  const reportedAds = useMemo(() => {
    const found: { name: string; metrics: AdsMetrics }[] = []
    if (meta.data) found.push({ name: 'Facebook Meta Ads', metrics: meta.data })
    if (google.data) found.push({ name: 'Google Ads', metrics: google.data })
    if (openai.data) found.push({ name: 'OpenAI Ads', metrics: openai.data })
    return found
  }, [meta.data, google.data, openai.data])

  return {
    woo,
    reportedAds,
    adsLoading: meta.isLoading || google.isLoading || openai.isLoading,
    combined: useMemo(() => combinedAds(reportedAds), [reportedAds]),
    blended: useMemo(
      () => (woo.error ? null : blendedAds(woo.data, reportedAds)),
      [woo.data, woo.error, reportedAds],
    ),
  }
}

export default function App() {
  const [pickedRange, setPickedRange] = useState<DateRange>(() =>
    rangeFromPreset('thisMonth'),
  )
  const [excludeToday, setExcludeToday] = useState(false)

  /**
   * The range everything is actually measured over.
   *
   * Shadowing the picked one rather than trimming at each reader: every query,
   * the comparison window, the prorated costs and every per-day figure derive
   * from this single value, so there is no path by which one card counts today
   * and the card beside it does not.
   */
  const range = useMemo(
    () => (excludeToday ? withoutToday(pickedRange) : pickedRange),
    [pickedRange, excludeToday],
  )
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
  // The CEO statement's fold. Held here because the control for it sits on the
  // section's title row rather than inside the card it opens.
  const [statementOpen, setStatementOpen] = useState(false)
  const statementId = useId()
  // The CEO section's analysis panel, held here for the same reason the
  // statement's fold is: the control that opens it sits on the section's title
  // row rather than inside the card it opens.
  const [ceoAnalysisOpen, setCeoAnalysisOpen] = useState(false)
  const ceoAnalysisId = useId()

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
  // One analyser and one prompt store for the whole page. Held here rather
  // than inside each section so two cards cannot each keep their own copy of
  // the same saved prompt and disagree about what it says.
  const sectionPrompts = useSectionPrompts()
  const saveSectionPrompts = useSaveSectionPrompts()
  const sectionAnalysis = useSectionAnalysis()
  const leadData = useLeads(range, against, view === 'leads')

  /*
   * The two sections that carry a period of their own.
   *
   * Their queries are keyed on the range like every other, so while a section
   * is following the page it reads the very same cache entry the page-level
   * hooks above filled — the extra hooks cost a request only once a section is
   * actually moved off the page's window.
   */
  const ceoScope = useSectionRange(range, comparison)
  const adsScope = useSectionRange(range, comparison)

  const ceoData = useScopedMetrics(ceoScope)
  const adsData = useScopedMetrics(adsScope)
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

  /**
   * The analysis wiring for one section.
   *
   * The prompt is saved back as a patch onto the stored set rather than as a
   * replacement: the store holds every section's prompt in one blob, and
   * writing only the section being edited would clear the others.
   */
  const analysisFor = (section: SectionPromptKey): SectionAnalysisWiring => ({
    prompt: sectionPrompts.data ? (sectionPrompts.data[section] ?? '') : undefined,
    onSavePrompt: (prompt) =>
      saveSectionPrompts.save({ ...(sectionPrompts.data ?? {}), [section]: prompt }),
    savingPrompt: saveSectionPrompts.saving,
    promptError: saveSectionPrompts.error ?? sectionPrompts.error?.message ?? null,
    onAnalyse: (prompt, snapshot) =>
      sectionAnalysis.run(section, SECTION_LABELS[section], snapshot, prompt),
    running: sectionAnalysis.running === section,
    result: sectionAnalysis.results[section],
    analysisError: sectionAnalysis.running === section ? null : sectionAnalysis.error,
  })

  const ceoAnalysis = analysisFor('ceo')

  const runAnalysis = () => {
    // The range travels with the snapshot so the report can be filed knowing
    // which period it describes — it outlives the picker that produced it.
    insights.analyse(snapshotOf(), range)
  }

  const onRangeChange = (next: DateRange) => {
    // Clamped on the way in rather than at each reader, so nothing derived
    // from the range — prorated costs above all — is measured against days
    // that have not happened yet.
    setPickedRange(clampRangeToAvailable(next))
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

  // Spend set against store revenue, for the page-level readers — the P&L
  // tab, the ad-spend tab and the targets. The All ads card no longer reads
  // these: it carries a period of its own and combines its own platforms.
  const blended = useMemo(
    () => blendedAds(woo.data, reportedAds),
    [woo.data, reportedAds],
  )

  // Named rather than implied: with one connector down the totals are still
  // real, but they are not everything that was spent.
  // Named rather than implied: with a connector down the totals are still
  // real, but they are not everything that was spent. Listed rather than
  // hard-coded now that there are three of them.
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
        excludeToday={excludeToday}
        onExcludeTodayChange={setExcludeToday}
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

        {view === 'leads' && (
          <LeadsSection
            report={leadData.data}
            loading={leadData.isLoading}
            failed={!!leadData.error}
            range={range}
            against={against}
            meta={meta.data}
            analysis={analysisFor('leads')}
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
            {/* Insights is not mounted here. It has its own tab, and the same
                element rendered in both places put a paid analysis above the
                figures on every visit to the Overview. */}
            <WooCommerceSection
              metrics={ceoData.woo.data}
              loading={ceoData.woo.isLoading}
              failed={!!ceoData.woo.error}
              range={ceoScope.range}
              against={ceoScope.against}
              actions={
                <>
                  {/* The section's own period, ahead of the two controls that
                      act on it: what it covers before what you do to it. */}
                  <SectionRangeControl {...ceoScope.control} />

                  {/* The analysis of the period, then the fold that opens the
                      statement it was written about. Two things you do to the
                      section, on the one line that names it.

                      The same control the Leads and All ads sections carry:
                      it opens a panel here rather than firing a run and
                      sending the reader to another tab. The full report still
                      lives on the Insights tab with its own button; this
                      answers the narrower question, about the card underneath
                      it, and under the standing prompt written for it. */}
                  <AnalyseButton
                    open={ceoAnalysisOpen}
                    panelId={ceoAnalysisId}
                    label="this period"
                    onToggle={() => setCeoAnalysisOpen((current) => !current)}
                    running={sectionAnalysis.running === 'ceo'}
                    disabled={!connectorsSettled}
                  />

                  <button
                    type="button"
                    onClick={() => setStatementOpen((current) => !current)}
                    aria-expanded={statementOpen}
                    aria-controls={statementId}
                    aria-label={
                      statementOpen ? 'Hide the statement' : 'Show the statement'
                    }
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-btn hover:text-ink"
                  >
                    <ChevronDown
                      size={15}
                      className={`transition-transform ${
                        statementOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                </>
              }
              analysis={
                <SectionAnalysis
                  section="ceo"
                  label="CEO Dashboard"
                  open={ceoAnalysisOpen}
                  panelId={ceoAnalysisId}
                  prompt={ceoAnalysis.prompt}
                  onSavePrompt={ceoAnalysis.onSavePrompt}
                  savingPrompt={ceoAnalysis.savingPrompt}
                  promptError={ceoAnalysis.promptError}
                  // The same aggregates the Insights tab sends, so the panel
                  // and the full report can never describe different periods.
                  onAnalyse={(prompt) => ceoAnalysis.onAnalyse(prompt, snapshotOf())}
                  running={ceoAnalysis.running}
                  result={ceoAnalysis.result}
                  analysisError={ceoAnalysis.analysisError}
                  className="mt-3"
                />
              }
              summary={
                <ProfitSummaryCard
                  woo={ceoData.woo.data}
                  reportedAds={ceoData.reportedAds}
                  costs={costs.data}
                  range={ceoScope.range}
                  against={ceoScope.against}
                  loading={
                    ceoData.woo.isLoading || ceoData.adsLoading || costs.isLoading
                  }
                  failed={!!ceoData.woo.error}
                  statementOpen={statementOpen}
                  statementId={statementId}
                />
              }
              beforeStats={
                <AdsStatsCard
                  metrics={adsData.combined ?? undefined}
                  platforms={adsData.reportedAds}
                  blended={adsData.blended}
                  subtitle={scopeOf(adsData.reportedAds)}
                  loading={adsData.adsLoading}
                  analysis={analysisFor('ads')}
                  rangeControl={<SectionRangeControl {...adsScope.control} />}
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
              costs={costs.data}
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
