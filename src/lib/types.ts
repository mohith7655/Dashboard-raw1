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

export interface OrdersPage {
  orders: Order[]
  total: number
  page: number
  perPage: number
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
