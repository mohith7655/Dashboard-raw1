/** A calendar date range, inclusive on both ends. Dates are `yyyy-MM-dd`. */
export interface DateRange {
  start: string
  end: string
  /** Which preset produced this range, if any. */
  preset: PresetId
}

export type PresetId =
  | 'today'
  | 'yesterday'
  | 'thisWeek'
  | 'lastWeek'
  | 'last7'
  | 'last30'
  | 'thisMonth'
  | 'lastMonth'
  | 'yearToDate'
  | 'allTime'
  | 'custom'

/**
 * Which window the selected range is measured against. Every delta on the
 * dashboard is a change from this one, so it is chosen once beside the range
 * rather than per card.
 *
 * `period` is the equal-length window immediately before — the older behaviour
 * and still the default. `week`, `month` and `year` shift the same range back
 * by one of those instead, which is what "the same fortnight last year" means.
 * `custom` names two dates outright, for anything further back.
 */
export type CompareMode = 'none' | 'period' | 'week' | 'month' | 'year' | 'custom'

export interface Comparison {
  mode: CompareMode
  /** Read only when `mode` is `custom`; the other modes derive their window. */
  range?: DateRange
}

/**
 * A single number plus its change against the comparison window. `deltaPct` is
 * null when there is no comparable prior value, and whenever the comparison is
 * turned off.
 */
export interface Metric {
  value: number
  deltaPct: number | null
  /**
   * The same figure over the comparison window, where the source knew it.
   *
   * Carried rather than recovered from `deltaPct`: the arithmetic that would
   * back it out — `value / (1 + deltaPct/100)` — divides by zero at exactly the
   * case worth reading, a figure that fell to nothing. Undefined where the
   * comparison is off or the source never computed one, which the display
   * treats as "no baseline" rather than as zero.
   */
  previous?: number | null
}

/**
 * Which direction is "good" for a metric. Drives delta colour only — the arrow
 * always follows the sign of the change.
 */
export type Polarity = 'up-good' | 'down-good' | 'neutral'

export const ORDER_STATUSES = [
  'cancelled',
  'completed',
  'failed',
  'on-hold',
  'processing',
  'refunded',
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

export interface RevenuePoint {
  /** `yyyy-MM-dd` */
  date: string
  revenue: number
}

/**
 * Refunds on the day they were issued, not the day the order was placed —
 * which is why this is its own series rather than a field on `RevenuePoint`.
 * The two are scoped by different dates and would not line up.
 */
export interface RefundPoint {
  /** `yyyy-MM-dd` */
  date: string
  /** A magnitude; the chart applies the sign. */
  refunds: number
}

export interface StatusCount {
  status: OrderStatus
  count: number
}

/**
 * One period of the revenue breakdown — a day as it comes off the orders, or
 * the week or month those days were folded into.
 *
 * The statement on the CEO Dashboard says what a whole period earned. This says
 * the same thing a row at a time, which is the only way to see which day the
 * discounting happened on, or that the refunds all landed in one week.
 *
 * Every figure is store currency and covers paid orders only, so a column
 * summed down its length reconciles to the statement's line of the same name.
 */
export interface RevenueBreakdownRow {
  /** `yyyy-MM-dd`. The bucket's first day when the rows are grouped. */
  date: string
  orders: number
  /** Product sales before any coupon comes off. */
  grossSales: number
  discounts: number
  shippingCharged: number
  taxCollected: number
  /**
   * Issued on this date, not on the date the order was placed. A refund can
   * land in a period the order it belongs to was never in, which is why the
   * column can exceed the gross sales of the row it sits on.
   */
  refunds: number
  /** Gross less coupons, plus shipping and tax: what was billed. */
  totalSales: number
}

/** How the breakdown's rows are grouped. */
export const BREAKDOWN_GRAINS = ['day', 'week', 'month'] as const
export type BreakdownGrain = (typeof BREAKDOWN_GRAINS)[number]

export interface SourceRevenue {
  source: string
  revenue: number
}

export interface MarketRevenue {
  /** ISO country code, or the ISO currency code on the currency split. */
  key: string
  orders: number
  /** Always in the store's own currency, so the splits are comparable. */
  revenue: number
  /** What it cost to fulfil these orders. */
  shippingCost: number
}

/**
 * A full statement for the period, reconciling to `totalRevenue`. Every figure
 * is store currency and covers paid orders only, so it agrees with the KPIs.
 */
export interface ProfitAndLoss {
  /** Product sales before any coupon comes off. */
  grossSales: number
  /** Coupon and cart discounts. */
  discounts: number
  shippingCharged: number
  taxCollected: number
  /** Reconciles to the Total Revenue KPI. */
  totalRevenue: number
  refunds: number
  productCost: number
  shippingCost: number
  transactionCost: number
  /** Metorik's `extra_cogs` — anything the store books outside the three above. */
  otherCost: number
  grossProfit: number
}

export interface WooMetrics {
  totalRevenue: Metric
  /** Customers whose very first order falls in the period. */
  newCustomers: Metric
  /**
   * Distinct customers who placed a paid order in the period — counted from
   * the orders themselves, so it is scoped exactly like the revenue figures.
   */
  totalCustomers: Metric
  /** Those who had bought before: total less new, never below zero. */
  returningCustomers: Metric
  avgOrderValue: Metric
  totalOrders: Metric
  totalCost: Metric
  productCost: Metric
  shippingCost: Metric
  transactionCost: Metric
  grossProfit: Metric
  /** Ratio in 0..1 — formatted as a percentage at the edge. */
  grossMargin: Metric
  revenueSeries: RevenuePoint[]
  /** What went back each day, on each refund's own date. */
  refundSeries: RefundPoint[]
  /** The statement a day at a time; the table groups these into weeks or months. */
  dailyBreakdown: RevenueBreakdownRow[]
  ordersByStatus: StatusCount[]
  revenueBySource: SourceRevenue[]
  revenueByCountry: MarketRevenue[]
  revenueByCurrency: MarketRevenue[]
  /** ISO code every figure above is expressed in, e.g. `USD`. */
  storeCurrency: string
  pnl: ProfitAndLoss
  /**
   * The same statement over the comparison window, or null when the comparison
   * is off. Carried as figures rather than as deltas because the lines are
   * combined before they are compared — net sales is gross less coupons, and
   * two percentages cannot be subtracted from one another.
   */
  pnlPrevious: ProfitAndLoss | null
  orderCount: number
}

/** The breakdowns the GA4 view can be sliced by. */
export const GA4_DIMENSIONS = [
  'country',
  'landingPage',
  'pagePath',
  'sourceMedium',
  'channel',
  'device',
  'browser',
  'operatingSystem',
] as const

export type Ga4Dimension = (typeof GA4_DIMENSIONS)[number]

export const GA4_DIMENSION_LABELS: Record<Ga4Dimension, string> = {
  country: 'Country',
  landingPage: 'Landing page',
  pagePath: 'Page',
  sourceMedium: 'Source / medium',
  channel: 'Channel',
  device: 'Device',
  browser: 'Browser',
  operatingSystem: 'Operating system',
}

/** The metric set every GA4 row and total carries. */
export interface Ga4Measures {
  users: number
  sessions: number
  pageViews: number
  /** Ratios in 0..1. */
  engagementRate: number
  bounceRate: number
  /** Seconds. */
  avgSessionDuration: number
  purchases: number
  revenue: number
  /** Purchases per session, derived here rather than taken from GA4. */
  conversionRate: number
  revenuePerUser: number
}

export interface Ga4Row extends Ga4Measures {
  /** The dimension value, e.g. `India` or `/products/hoodie`. */
  key: string
}

export interface Ga4Report {
  dimension: Ga4Dimension
  totals: Ga4Measures
  rows: Ga4Row[]
  /** GA4's own currency for `revenue`, e.g. `USD`. */
  currency: string
  /**
   * Metrics this property did not offer, so the table can grey those columns
   * instead of showing a column of zeroes as though they were measured.
   */
  unsupported: string[]
}

export interface TrafficPoint {
  /** `yyyy-MM-dd` */
  date: string
  visitors: number
  orders: number
  /** Ratio in 0..1. Metorik reports a percentage; it is normalised at the edge. */
  conversionRate: number
}

/**
 * Store traffic as the connected analytics provider reports it. Metorik relays
 * this from GA4 rather than measuring it, so it is only present once that
 * integration is connected.
 */
export interface TrafficMetrics {
  /** False when no analytics provider is connected — not the same as zero traffic. */
  available: boolean
  /** e.g. `google_analytics`. */
  provider: string
  /** The provider's own metric name, e.g. `totalUsers`. */
  providerMetric: string
  /** The provider's wording for what one visitor means. */
  visitorDefinition: string
  visitors: Metric
  orders: Metric
  conversionRate: Metric
  series: TrafficPoint[]
}

/** One campaign, as its own platform reports it, over the requested period. */
export interface Campaign {
  /** Unique within a platform only; pair it with the platform name for a key. */
  id: string
  name: string
  /** Normalised to `Active` / `Paused` / `Ended`, or empty when unreported. */
  status: string
  spend: number
  impressions: number
  clicks: number
  /** Ratio in 0..1 */
  ctr: number
  conversions: number
  /** Platform-attributed revenue, which is what its ROAS divides by spend. */
  conversionValue: number
  roas: number
  cpc: number
}

/**
 * The raw counters a platform reports, before any ratio is derived.
 *
 * Platforms only combine at this level. Two CTRs cannot be added, and the CTR
 * of Meta and Google together is their summed clicks over their summed
 * impressions — not the mean of the two figures.
 */
export interface AdsCounters {
  spend: number
  impressions: number
  clicks: number
  conversions: number
  conversionValue: number
}

export interface AdsMetrics {
  spend: Metric
  impressions: Metric
  clicks: Metric
  /** Ratio in 0..1 */
  ctr: Metric
  roas: Metric
  cpc: Metric
  cpm: Metric
  conversions: Metric
  /**
   * False where the platform reports no attributed conversions at all —
   * OpenAI Ads offers impressions, clicks and spend and nothing else.
   *
   * Not the same as having converted nothing. A zero would read as a failed
   * campaign, and summed into the combined account it would drag the ROAS of
   * the platforms that do report attribution down with it. Absent where the
   * platform reports normally, so the existing connectors need no change.
   */
  reportsConversions?: boolean
  /** Every campaign that spent or served in the period, largest spend first. */
  campaigns: Campaign[]
  /** What the metrics above were derived from, kept so platforms can be summed. */
  totals: AdsCounters
  /** The same over the comparison window, or null when it is off. */
  previousTotals: AdsCounters | null
}

export interface Order {
  id: string
  /** Display number without the leading `#`. */
  number: string
  /** ISO timestamp in the store's own timezone — the one Metorik filters on. */
  date: string
  customer: string
  /** Empty when the order carries no billing email. */
  email: string
  city: string
  /** ISO alpha-2, as the billing or shipping address gave it. */
  country: string
  /**
   * ISO code the customer was billed in. `total` is already converted to the
   * store's own currency, so an order can read EUR beside a dollar figure —
   * this says what was paid, not what the total is denominated in.
   */
  currency: string
  /**
   * What the customer was charged, in `currency`. Derived from the rate the
   * order itself was booked at, so a foreign order reads at the rate of its own
   * day rather than today's. Zero on a fully refunded foreign order, where
   * there is nothing left to take the rate from.
   */
  paid: number
  status: OrderStatus
  items: number
  /** Converted to the store's own currency, so orders are comparable. */
  total: number
}

/**
 * A buyer's history with the store, as at the moment the page was read.
 *
 * Lifetime figures, not period ones: the question the orders table raises is
 * whether the name on this row has bought before, which the selected range
 * cannot answer — a customer of eight years who last ordered in March is a
 * returning customer whatever window is on screen.
 */
export interface CustomerSummary {
  /** Orders ever placed, this one included. One means it is their first. */
  orderCount: number
  /** Items ever bought across those orders. */
  itemCount: number
  totalSpent: number
  /** ISO timestamp of their first order, or empty where the store has none. */
  firstOrderDate: string
}

export interface OrdersPage {
  orders: Order[]
  total: number
  page: number
  perPage: number
  /**
   * Lifetime history for the buyers on this page, keyed by lowercased email.
   *
   * Fetched with the page rather than per row: ten rows would otherwise be ten
   * requests, and the answer for every one of them comes from a single
   * customers call filtered to the emails on screen. Absent for a row with no
   * email — a guest checkout has no history to look up.
   */
  customers: Record<string, CustomerSummary>
}

/** One of a customer's other orders, for the history opened from a row. */
export interface CustomerOrderLine {
  name: string
  quantity: number
}

export interface CustomerOrder {
  id: string
  number: string
  /** ISO timestamp in the store's own timezone. */
  date: string
  status: OrderStatus
  total: number
  currency: string
  items: number
  /** What was on the order, largest line first. */
  lines: CustomerOrderLine[]
}

export interface CustomerOrders {
  email: string
  orders: CustomerOrder[]
}

export type OrderSortField = 'date' | 'total'
export type SortDirection = 'asc' | 'desc'

export interface OrdersQuery {
  page: number
  perPage: number
  sort: OrderSortField
  direction: SortDirection
}

/**
 * How often an operating cost recurs. `once` is a single dated charge; the
 * rest repeat forever and are prorated onto whatever range is on screen.
 */
export type CostCadence = 'once' | 'daily' | 'weekly' | 'monthly' | 'yearly'

/** Offered in order of frequency; the editor defaults a new row to monthly. */
export const COST_CADENCES: CostCadence[] = [
  'daily',
  'weekly',
  'monthly',
  'yearly',
  'once',
]

export const COST_CATEGORIES = [
  'Salaries',
  'Software',
  'Marketing',
  'Rent',
  'Contractors',
  'Other',
] as const

export type CostCategory = (typeof COST_CATEGORIES)[number]

/**
 * A cost the store itself never sees — payroll, SaaS, rent. Entered by hand and
 * stored server-side, then prorated onto the selected range.
 */
export interface OperatingCost {
  id: string
  name: string
  category: CostCategory
  /** The charge for one occurrence of `cadence`, in store currency. */
  amount: number
  cadence: CostCadence
  /**
   * `yyyy-MM-dd`. The date the charge lands.
   *
   * Required for `once`. For the recurring cadences it is the anchor the charge
   * repeats from — weekly every seven days after it, monthly on its day of the
   * month, yearly on its month and day — which makes each charge discrete: a
   * range either contains one or it does not. Blank prorates across the period
   * instead, spreading the amount evenly.
   */
  date?: string
  /**
   * `yyyy-MM-dd`. A recurring cost does not apply before this date — when a
   * salary started, when a subscription was taken out. Blank means it always has.
   *
   * The editor asks for this and `date` as one question, since a cost that
   * started on the 5th also bills on the 5th, and writes the answer to both.
   * They can still differ in rows written before that, so the two stay separate
   * here and are resolved independently.
   */
  startDate?: string
  /** `yyyy-MM-dd`. Nor after it — when it was cancelled. Blank means it still runs. */
  endDate?: string
}

/** One cost resolved against a date range. */
export interface CostLine extends OperatingCost {
  /** The share of `amount` that falls inside the range. */
  applied: number
}

/* ------------------------- Shipping profit & loss ----------------------- */

/** What one destination was charged for postage, against what it cost. */
export interface ShippingChargedRow {
  /** ISO alpha-2, matching the key the order splits are grouped under. */
  country: string
  /** Postage the customer paid, in store currency. */
  charged: number
  /** Kept apart from `charged` rather than folded in — it is not postage. */
  tax: number
  orders: number
}

export interface ShippingChargedPayload {
  byCountry: ShippingChargedRow[]
  /** Every destination, including any not asked about. */
  storeCharged: number
  storeTax: number
  /** True when more destinations existed than the per-country cap allows. */
  truncated: boolean
}

/* --------------------------- Shipping surcharges ------------------------ */

export const SHIPPING_COST_BASES = ['per-order', 'flat'] as const

export type ShippingCostBasis = (typeof SHIPPING_COST_BASES)[number]

/**
 * A shipping charge the orders do not carry: customs, a courier surcharge, a
 * per-region 3PL fee. Entered by hand against a destination and stored
 * server-side, like the operating costs.
 */
export interface CountryShippingCost {
  id: string
  /** ISO alpha-2, matching the key the order splits are grouped under. */
  country: string
  /** What it is, for the operator's own reference. */
  label: string
  /** In store currency: per order shipped there, or flat for the period. */
  amount: number
  basis: ShippingCostBasis
}

/** One surcharge resolved against a period's orders to that country. */
export interface ShippingCostLine extends CountryShippingCost {
  /** Orders shipped to `country` in the range — zero for a flat charge's sake. */
  orders: number
  /** What the surcharge comes to over the range. */
  applied: number
}

/* ------------------------------- Insights ------------------------------- */

export type InsightSeverity = 'critical' | 'warning' | 'good'
export type InsightLevel = 'high' | 'medium' | 'low'

/** Something the model noticed in the period's figures. */
export interface InsightFinding {
  title: string
  detail: string
  severity: InsightSeverity
  /** The figures behind the claim, so it can be checked against the tabs. */
  evidence: string
}

/** Something to do about it. */
export interface InsightAction {
  title: string
  detail: string
  impact: InsightLevel
  effort: InsightLevel
  /** The one number that says whether it worked. */
  metric: string
}

export interface InsightsReport {
  headline: string
  summary: string
  findings: InsightFinding[]
  actions: InsightAction[]
  /** Which OpenAI model wrote this, since it is configurable. */
  model: string
  /** ISO timestamp, so a report kept on screen is visibly of its moment. */
  generatedAt: string
}

/** One answer to one typed question about the period on screen. */
export interface InsightsAnswer {
  question: string
  answer: string
  model: string
  /** ISO timestamp, so an exchange kept on screen is visibly of its moment. */
  answeredAt: string
}

/* ----------------------------- Search Console ----------------------------- */

export const GSC_DIMENSIONS = ['query', 'page', 'country', 'device'] as const
export type GscDimension = (typeof GSC_DIMENSIONS)[number]

export const GSC_DIMENSION_LABELS: Record<GscDimension, string> = {
  query: 'Search query',
  page: 'Landing page',
  country: 'Country',
  device: 'Device',
}

/**
 * The four figures Search Console reports for any cut of the data.
 *
 * `ctr` is a fraction, not a percentage, matching every other rate on the
 * dashboard. `position` is an average rank where **lower is better** — the one
 * measure here whose polarity inverts.
 */
export interface GscMeasures {
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface GscRow extends GscMeasures {
  /** The dimension value — the query text, the URL, the country code. */
  key: string
}

export interface GscReport {
  /** The property queried, in Search Console's own notation (`sc-domain:example.com`). */
  siteUrl: string
  dimension: GscDimension
  totals: GscMeasures
  /** The same measures over the comparison window, or null when comparison is off. */
  previousTotals: GscMeasures | null
  rows: GscRow[]
  /** One point per day, for the trend. */
  series: { date: string; clicks: number; impressions: number }[]
  /**
   * The most recent day that returned data.
   *
   * Search Console finalises two to three days late. Without this the last days
   * of any range read as a collapse in traffic rather than as data that has not
   * arrived, which is the single most common misreading of this report.
   */
  freshestDate: string | null
}

/* ----------------------------- Merchant Center ----------------------------- */

/** One product-data problem, and how many items it affects. */
export interface FeedIssue {
  code: string
  description: string
  detail: string
  documentation: string
  /**
   * What the issue costs: `disapproved` items do not serve at all, `demoted`
   * ones serve worse, `unaffected` is advisory. Merchant Center's own wording.
   */
  servability: string
  affected: number
}

/** Item counts for one destination in one country. */
export interface FeedDestination {
  destination: string
  country: string
  active: number
  pending: number
  disapproved: number
  expiring: number
}

/** A problem with the account rather than with the products in it. */
export interface FeedAccountIssue {
  title: string
  severity: string
  detail: string
  documentation: string
}

export interface MerchantFeed {
  merchantId: string
  /** False when the store's domain is not claimed, which stops items serving. */
  websiteClaimed: boolean
  totals: { active: number; pending: number; disapproved: number; expiring: number }
  destinations: FeedDestination[]
  issues: FeedIssue[]
  accountIssues: FeedAccountIssue[]
}

/* -------------------------------- Markifact -------------------------------- */

export interface MarkifactConnection {
  id: string
  /** Platform slug as Markifact names it — `gads`, `ga4`, `meta_ads`. */
  type: string
  displayName: string
  /** Unix seconds. */
  createdAt: number
}

export interface MarkifactCredits {
  limit: number
  used: number
  remaining: number
  tier: string
  /** Unix seconds; when the allowance resets. */
  periodEnd: number
}

/** One operation an agent or client ran, as Markifact logged it. */
export interface MarkifactLog {
  id: string
  operationId: string
  status: string
  /** What ran it — an agent's name, a workflow, or the MCP client. */
  source: string
  startedAt: number
  creditsUsed: number
  cacheHit: boolean
}

/** The same operations rolled up, so a costly or failing one is visible at a glance. */
export interface MarkifactOperationRollup {
  operationId: string
  runs: number
  failures: number
  credits: number
}

export interface MarkifactAccount {
  credits: MarkifactCredits
  connections: MarkifactConnection[]
  logs: MarkifactLog[]
  operations: MarkifactOperationRollup[]
}

/* --------------------------- Scheduled reports --------------------------- */

export const REPORT_FREQUENCIES = ['daily', 'weekly', 'monthly'] as const
export type ReportFrequency = (typeof REPORT_FREQUENCIES)[number]

/**
 * Which window an unattended run analyses.
 *
 * Named rather than dated: a schedule outlives any particular fortnight, and a
 * stored pair of dates would have every Monday's report describe the same week.
 * Only periods that are over or running are offered — `today` would be analysed
 * at whatever hour the run fires.
 */
export const REPORT_PERIODS = [
  'yesterday',
  'last7',
  'last30',
  'thisMonth',
  'lastMonth',
] as const
export type ReportPeriod = (typeof REPORT_PERIODS)[number]

/**
 * When the dashboard should write a report without being asked.
 *
 * Every field is on the store's calendar, not the reader's — the same dashboard
 * is opened from three countries and a schedule that meant a different hour to
 * each of them would be unreadable. See `timeZone.ts`.
 */
export interface InsightsSchedule {
  enabled: boolean
  frequency: ReportFrequency
  /** `HH:mm`, 24-hour. The run fires on the first hour at or after it. */
  time: string
  /** 0 = Sunday … 6 = Saturday. Read only when `frequency` is `weekly`. */
  weekday: number
  /** 1–28. Read only when `frequency` is `monthly`; see `MAX_DAY_OF_MONTH`. */
  dayOfMonth: number
  period: ReportPeriod
}

/**
 * Capped below 29 deliberately: a monthly schedule on the 31st would skip
 * February entirely, and silently missing a month is worse than running on a
 * day the reader did not pick.
 */
export const MAX_DAY_OF_MONTH = 28

/** A report that was kept, with enough of its run attached to be trusted. */
export interface StoredInsightsReport {
  report: InsightsReport
  /** The period it describes — a stored report is read long after its range left the screen. */
  range: DateRange
  /** Whether the schedule produced it or someone clicked Analyze. */
  trigger: 'scheduled' | 'manual'
}

/** The settings and everything the last run left behind. */
export interface InsightsAutomation {
  schedule: InsightsSchedule
  /** The most recent report from either trigger, or null before the first one. */
  latest: StoredInsightsReport | null
  /** ISO timestamp of the last scheduled attempt, successful or not. */
  lastRunAt: string | null
  /** Why the last scheduled attempt failed, or null when it did not. */
  lastError: string | null
}

/** Every upstream error is normalised into this shape before it reaches the UI. */
export interface SourceError {
  /** Human label for the failing connector, e.g. "Facebook Ads". */
  source: string
  /** The raw upstream message, preserved verbatim. */
  message: string
  /** Optional trailing hint rendered on the banner's second line. */
  hint?: string
}

/** Adapters never throw — they resolve to one side of this union populated. */
export interface AdapterResult<T> {
  data: T | null
  error: SourceError | null
}

/* --------------------------- Section analysis --------------------------- */

/**
 * The sections that can be analysed on their own, rather than as part of the
 * whole-period report on the Insights tab.
 *
 * A card gets one where the question it answers is not the question the report
 * answers. "Which campaign is wasting money" is a different enquiry from "how
 * did the period go", and a report long enough to cover both is one nobody
 * reads to the end of.
 */
export const SECTION_PROMPT_KEYS = ['ceo', 'ads', 'leads'] as const

export type SectionPromptKey = (typeof SECTION_PROMPT_KEYS)[number]

/** How each section names itself to the model, as it names itself on screen. */
export const SECTION_LABELS: Record<SectionPromptKey, string> = {
  ceo: 'CEO Dashboard',
  ads: 'All ads',
  leads: 'Leads',
}

/**
 * What each section's analysis should pay attention to, in the reader's own
 * words. A section with no entry is analysed on the built-in rules alone.
 */
export type SectionPrompts = Partial<Record<SectionPromptKey, string>>

/* -------------------------------- Leads -------------------------------- */

/**
 * Where a lead came from.
 *
 * The two email lists and the Facebook lead-ads capture. The WhatsApp tab in
 * the same spreadsheet is not among them: its rows are post-purchase order
 * confirmations — "I just placed an order" — which is the opposite end of the
 * funnel and would inflate the count with people who had already bought.
 */
export type LeadSourceKey = 'mailchimp' | 'flodesk' | 'facebook'

export const LEAD_SOURCES: LeadSourceKey[] = ['mailchimp', 'flodesk', 'facebook']

export const LEAD_SOURCE_LABELS: Record<LeadSourceKey, string> = {
  mailchimp: 'Mailchimp',
  flodesk: 'Flodesk',
  facebook: 'Facebook lead ads',
}

export interface LeadSourceStats {
  /** Distinct people in the window, compared against the previous one. */
  count: Metric
}

/** One day of the period, each source counted separately. */
export interface LeadDayPoint {
  date: string
  mailchimp: number
  flodesk: number
  facebook: number
}

export interface LeadCampaign {
  name: string
  leads: number
}

export interface LeadReport {
  sources: Record<LeadSourceKey, LeadSourceStats>
  /** Orders placed by list members, counted on the order's own date. */
  orders: Record<'mailchimp' | 'flodesk', LeadSourceStats>
  /**
   * The cohort that joined inside the period, and how many of them have
   * ordered since — at any date, so a lead who joined on the last day and
   * bought the next morning still counts.
   */
  converted: { signups: number; ordered: number }
  series: LeadDayPoint[]
  campaigns: LeadCampaign[]
  /**
   * The most recent day each source wrote a row, across all time.
   *
   * A stale automation and a quiet week look identical in a count of zero.
   * This is what tells them apart, and the card says so outright rather than
   * reporting the zero as a result.
   */
  lastSeen: Record<LeadSourceKey, string | null>
}

/* ------------------------------- Targets ------------------------------- */

/**
 * What a target is aiming at.
 *
 * The first three are figures to reach and read straight off the CEO
 * statement — `revenue` is what the store kept, `sales` what it billed, and
 * `profit` what was left after the goods, the advertising and the overheads.
 * `roas` is not a figure to reach but a return to hold or beat: different
 * arithmetic, not a fourth label on the same one. A money goal divides into
 * the budget it needs, while a return goal divides a budget into what it may
 * spend.
 */
export type TargetGoal = 'revenue' | 'sales' | 'profit' | 'roas'

/**
 * Listed widest first, which is also the order the statement reads in. The
 * editor renders them in this order and the plan anchors its budget on the
 * first money goal it finds here, so the sequence is load-bearing.
 */
export const TARGET_GOALS: TargetGoal[] = ['revenue', 'sales', 'profit', 'roas']

export const TARGET_GOAL_LABELS: Record<TargetGoal, string> = {
  revenue: 'Revenue',
  sales: 'Sales',
  profit: 'Net profit',
  roas: 'Return on ad spend',
}

/**
 * The three that are amounts to reach, against the one that is a rate to hold.
 * They divide differently, so nearly every branch in the plan turns on this.
 */
export const isMoneyGoal = (goal: TargetGoal): boolean => goal !== 'roas'

/**
 * One thing a target is aiming at, and the figure it is aiming for.
 *
 * A target carries a list of these rather than a single goal: "$50,000 of
 * revenue and $8,000 of profit by 30 September" is one commitment made two
 * ways, and splitting it into two targets would give each its own budget and
 * its own deadline to drift on.
 */
export interface TargetAim {
  goal: TargetGoal
  /** Money to reach, or the return to hold — read against `goal`. */
  amount: number
}

export interface Target {
  id: string
  /** What to call it on the card, e.g. "Q3 sales push". */
  name: string
  /**
   * One or more aims, in the order they were chosen. Never empty: a target
   * with nothing to reach has no arithmetic in it, and the store rejects one.
   */
  aims: TargetAim[]
  /**
   * Ad budget as a percentage of sales rather than a sum.
   *
   * A sum goes stale the moment the target moves: raise the goal and the
   * budget behind it silently becomes a smaller share of it. A percentage is
   * the figure the store is actually run on — it is the same quantity the All
   * ads card reports as "spend % of sales" — so a target and its budget cannot
   * drift apart. Zero means unfunded.
   */
  budgetPct: number
  /**
   * `yyyy-MM-dd` the target runs from.
   *
   * The window it opens is what makes "22 days left" mean something: on its
   * own a deadline says how long is left but never how long there was, so a
   * target three days from its date reads identically whether it was set last
   * week or last quarter. Where the date is still ahead, the rates below
   * divide by the whole window rather than by a count that has not started
   * running down yet.
   */
  start: string
  /**
   * Count the window from the first of `start`'s month rather than from
   * `start` itself.
   *
   * Advertising is bought and reconciled by the month, so money already spent
   * in the month a target opens in has, in practice, been spent against it —
   * and a target set mid-month that ignored it would show a budget with more
   * left in it than the account really has.
   *
   * Moving the whole window rather than the spend alone is deliberate. Spend
   * counted from the first against sales counted from the sixteenth is a
   * return struck from two different periods, which is a worse error than the
   * one it would fix.
   */
  countFromMonthStart: boolean
  /**
   * `yyyy-MM-dd` the target is to be met by. Never before `start`.
   *
   * The plan is struck from the days between today and this, not from a fixed
   * month: a rate that ignored the deadline would go on recommending the same
   * daily spend with a week left as it did with a quarter.
   */
  deadline: string
}

/**
 * What has actually happened inside a target's own window, so far.
 *
 * Fetched for the window the target names — not the range in the picker. A
 * target running to the end of the month has already had money spent against
 * it and sales made towards it, and a plan struck from whatever period happens
 * to be on screen would ask the store to earn the whole goal over again from
 * today, and to fund it out of a budget it had already spent half of.
 */
export interface TargetProgress {
  /** Days of the window already traded, inclusive of today. Zero before it opens. */
  days: number
  /** Taken inside the window so far, on the statement's own definitions. */
  revenue: number
  sales: number
  profit: number
  /** Ad spend inside the window so far. */
  spend: number
  /** Revenue over spend inside the window, or null below a token spend. */
  roas: number | null
}

/**
 * A target with the arithmetic done and the advice struck from its own window.
 * Derived on the client from metrics already loaded — nothing here is stored,
 * so it can never disagree with the cards above it.
 */
export interface TargetPlan {
  target: Target
  /**
   * What the window has done so far, or null while it is being fetched or if
   * that fetch failed. Null leaves every figure below unknown rather than
   * silently falling back to the period on screen, which would answer a
   * different question in the same shape.
   */
  progress: TargetProgress | null
  /**
   * Which figures the rates were struck from.
   *
   * `window` — the target's own trading, which is what it should be once it is
   * under way. `recent` — the store's current performance standing in, because
   * the window has not opened or has spent nothing yet; the plan is then an
   * estimate and the card says so. `none` — nothing to plan from at all.
   */
  basis: 'window' | 'recent' | 'none'
  /**
   * The budget the split is struck from: the one entered, or the one the goal
   * implies where none was.
   *
   * A target set without a budget is the ordinary case — the reason to write a
   * goal down is usually to find out what it costs. Splitting a zero into days
   * would answer that with three zeroes while the card had the figure all
   * along.
   */
  budgetBasis: number
  /** True where `budgetBasis` is the implied budget rather than the entered one. */
  basisIsImplied: boolean
  /**
   * Days from today to the deadline, inclusive. Zero once it has passed, which
   * the card reports as overdue rather than dividing by.
   *
   * The whole window while the start date is still ahead: a target that has
   * not begun has all of its days left, and counting down to a deadline from
   * before the beginning would recommend a daily rate for days it is not meant
   * to be traded in.
   */
  daysLeft: number
  /** Days from the start to the deadline, inclusive — the window in full. */
  windowDays: number
  /**
   * Days of the window already gone. Zero before it opens, `windowDays` once
   * the deadline has passed.
   */
  daysElapsed: number
  /** True while the start date is still ahead of today. */
  notStarted: boolean
  /**
   * Of `budgetBasis`, what is left to spend: the budget less what the window
   * has already spent against it, never below zero.
   */
  budgetRemaining: number
  /** `budgetRemaining` split across `daysLeft` — what is spendable from here. */
  perDay: number
  perWeek: number
  perMonth: number
  /**
   * Each aim worked out on its own, in the order it was set.
   *
   * One block per aim rather than one set of figures for the target: revenue
   * and profit are reached at different rates and the store is on pace for one
   * and not the other more often than not, so a single "on pace" figure would
   * have to pick which of them it meant.
   */
  aims: AimPlan[]
  /** What the store is actually spending a day, over the selected period. */
  pacingPerDay: number | null
  /**
   * Budget the goal implies at the current blended return, or null where the
   * return is unknown — with no revenue per ad dollar there is nothing to
   * divide by, and a zero would read as "no budget needed".
   */
  impliedBudget: number | null
  /** Sales the budget buys at the current return, for a `sales` goal. */
  projected: number | null
  /** Fraction of the goal the current pace reaches, 1 being on target. */
  attainment: number | null
  notes: TargetNote[]
}

/**
 * One aim with its own arithmetic done: the rate it has to be met at, and the
 * rate the store is actually trading at against it.
 */
export interface AimPlan {
  goal: TargetGoal
  amount: number
  /**
   * The goal itself at the rate it must be met, not the budget behind it.
   *
   * "$30,000 by 31 August" is a number nobody can act on daily; "$1,363 a day,
   * $9,545 a week" is the same target in the units trading actually happens in.
   * Null for a return aim, which is already a rate and divides into nothing.
   */
  perDay: number | null
  perWeek: number | null
  perMonth: number | null
  /**
   * Already banked inside the target's own window — money for a money aim, the
   * window's blended return for a return aim. Null where the window has not
   * reported.
   */
  achieved: number | null
  /**
   * Still to find: the goal less what is already banked, never below zero.
   * Null for a return aim, which does not accumulate and so has nothing left
   * over to earn.
   */
  remaining: number | null
  /**
   * What the store is currently achieving in this aim's own units — money per
   * day for a money aim, the blended return itself for a return aim. Null
   * where the window reported nothing to strike it from.
   */
  runRate: number | null
  /**
   * Where the aim finishes if the window goes on trading as it has: what is
   * already banked plus the run rate over the days that remain. For a return
   * aim it is the return itself, since a rate does not accumulate.
   */
  pace: number | null
  paceAttainment: number | null
}

export type TargetNoteTone = 'good' | 'warn' | 'bad'

/** One piece of advice, each traceable to a figure on the dashboard. */
export interface TargetNote {
  tone: TargetNoteTone
  title: string
  detail: string
}

/**
 * Advice on one target, written by OpenAI from the plan already computed.
 *
 * The notes carry the same shape the rule-based ones do, so the card renders
 * both identically — the reader should not have to learn a second grammar to
 * read the same kind of claim.
 */
export interface TargetAdvice {
  headline: string
  notes: TargetNote[]
  model: string
  /** ISO timestamp; the card says when, so stale advice cannot pass as fresh. */
  generatedAt: string
}
