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
 * A single number plus its change against the immediately preceding period of
 * equal length. `deltaPct` is null when there is no comparable prior value.
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

export interface StatusCount {
  status: OrderStatus
  count: number
}

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
  newCustomers: Metric
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
  ordersByStatus: StatusCount[]
  revenueBySource: SourceRevenue[]
  revenueByCountry: MarketRevenue[]
  revenueByCurrency: MarketRevenue[]
  /** ISO code every figure above is expressed in, e.g. `USD`. */
  storeCurrency: string
  pnl: ProfitAndLoss
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
  /** Every campaign that spent or served in the period, largest spend first. */
  campaigns: Campaign[]
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
  country: string
  status: OrderStatus
  items: number
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
export type CostCadence = 'once' | 'weekly' | 'monthly' | 'yearly'

export const COST_CADENCES: CostCadence[] = [
  'monthly',
  'weekly',
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
  /** `yyyy-MM-dd`. Required for `once`; the date the charge landed. */
  date?: string
}

/** One cost resolved against a date range. */
export interface CostLine extends OperatingCost {
  /** The share of `amount` that falls inside the range. */
  applied: number
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

