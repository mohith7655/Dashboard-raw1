import type { Metric } from '../types'

/* ------------------------------ Commerce ------------------------------ */

export type CustomerSegment = 'new' | 'returning' | 'vip' | 'at-risk'

export interface CustomerRow {
  id: string
  name: string
  email: string
  orders: number
  /** Lifetime value. */
  ltv: number
  aov: number
  firstOrder: string
  lastOrder: string
  city: string
  country: string
  segment: CustomerSegment
}

export type ProductStockStatus = 'in-stock' | 'low-stock' | 'out-of-stock'

export interface ProductRow {
  id: string
  name: string
  sku: string
  qtySold: number
  revenue: number
  orders: number
  avgPrice: number
  refunded: number
  stock: number
  stockStatus: ProductStockStatus
}

export type CouponType = 'percent' | 'fixed_cart' | 'fixed_product'

export interface CouponRow {
  id: string
  code: string
  type: CouponType
  amount: number
  used: number
  usageLimit: number | null
  revenue: number
  discount: number
  expires: string | null
}

export type CartStatus = 'active' | 'abandoned' | 'recovered' | 'placed'

export interface CartRow {
  id: string
  customer: string
  email: string
  items: number
  value: number
  createdAt: string
  updatedAt: string
  status: CartStatus
}

/* ------------------------------- Analyze ------------------------------ */

export type ReportType = 'revenue' | 'products' | 'customers' | 'coupons' | 'traffic'

export interface ReportRow {
  id: string
  name: string
  type: ReportType
  description: string
  lastRun: string
  owner: string
  favorite: boolean
}

/** One acquisition cohort and its retention across subsequent periods. */
export interface CohortRow {
  /** e.g. `2026-02` */
  cohort: string
  size: number
  /** Retention ratio per period offset; null once the period is in the future. */
  retention: (number | null)[]
}

export type GoalStatus = 'on-track' | 'at-risk' | 'behind' | 'achieved'

export interface GoalRow {
  id: string
  name: string
  metric: string
  target: number
  current: number
  period: string
  status: GoalStatus
  format: 'currency' | 'integer' | 'percent'
}

export type DigestFrequency = 'daily' | 'weekly' | 'monthly'

export interface DigestRow {
  id: string
  name: string
  frequency: DigestFrequency
  recipients: number
  lastSent: string
  nextSend: string
  enabled: boolean
}

export type ExportStatus = 'complete' | 'processing' | 'failed' | 'queued'

export interface ExportRow {
  id: string
  name: string
  resource: string
  format: 'CSV' | 'XLSX' | 'JSON'
  rows: number
  status: ExportStatus
  createdAt: string
  sizeKb: number
}

export type CostType = 'cogs' | 'shipping' | 'transaction' | 'advertising' | 'custom'

export interface CostRow {
  id: string
  type: CostType
  description: string
  period: string
  amount: number
  source: string
  /** How the cost is applied, e.g. "Per order" or "% of revenue". */
  basis: string
}

export interface CustomMetricRow {
  id: string
  name: string
  formula: string
  value: number
  format: 'currency' | 'integer' | 'percent' | 'ratio'
  description: string
  trendPct: number | null
}

/* -------------------------------- Engage ------------------------------ */

export interface EngageOverview {
  subscribers: Metric
  emailsSent: Metric
  openRate: Metric
  clickRate: Metric
  revenue: Metric
  unsubscribes: Metric
  /** Daily sends and opens for the Engage stats chart. */
  series: EngagePoint[]
}

export interface EngagePoint {
  date: string
  sent: number
  opened: number
  clicked: number
  revenue: number
}

export type CampaignType = 'broadcast' | 'automation'
export type CampaignStatus = 'sent' | 'sending' | 'scheduled' | 'draft' | 'active'

export interface CampaignRow {
  id: string
  name: string
  type: CampaignType
  status: CampaignStatus
  sent: number
  opens: number
  clicks: number
  revenue: number
  sentAt: string | null
}

export interface ProfileRow {
  id: string
  name: string
  email: string
  subscribed: boolean
  /** 0–100 engagement score. */
  engagement: number
  revenue: number
  lastActive: string
  source: string
}

export interface SentEmailRow {
  id: string
  subject: string
  campaign: string
  recipient: string
  sentAt: string
  opened: boolean
  clicked: boolean
  revenue: number
}

/* ------------------------------ Envelopes ----------------------------- */

/** A page of rows plus the KPI strip that sits above it. */
export interface ResourcePage<Row> {
  rows: Row[]
  total: number
  page: number
  perPage: number
}

export interface CustomersPayload extends ResourcePage<CustomerRow> {
  totalCustomers: Metric
  newCustomers: Metric
  returningRate: Metric
  avgLtv: Metric
}

export interface ProductsPayload extends ResourcePage<ProductRow> {
  productsSold: Metric
  productRevenue: Metric
  avgPrice: Metric
  refundRate: Metric
}

/**
 * One code's standing in the period: how much it was used, what that cost, and
 * whether it is being reached for more or less than before.
 */
export interface CouponUsage {
  code: string
  type: CouponType
  /** Redemptions inside the period. */
  used: number
  discount: number
  revenue: number
  /** Fraction of every redemption in the period, 0..1. */
  share: number
  /**
   * Redemptions in the comparison window, or null when the comparison is off.
   * Zero is meaningful and distinct from null: the code is new this period.
   */
  previousUsed: number | null
  /** Null where there is no baseline to divide by — see `previousUsed`. */
  usedDeltaPct: number | null
}

export interface CouponsPayload extends ResourcePage<CouponRow> {
  couponsUsed: Metric
  discountTotal: Metric
  couponRevenue: Metric
  avgDiscount: Metric
  /** Ranked by redemptions in the period, longest-used first. */
  topCoupons: CouponUsage[]
  /**
   * Codes redeemed in the comparison window and not at all in this one. They
   * cannot appear in `topCoupons`, which is built from this period's usage, yet
   * they are often the whole reason usage fell. Null when the comparison is off.
   */
  lapsedCodes: number | null
}

export interface CartsPayload extends ResourcePage<CartRow> {
  abandonedCarts: Metric
  abandonedValue: Metric
  recoveredCarts: Metric
  recoveryRate: Metric
}

export interface CostsPayload extends ResourcePage<CostRow> {
  totalCost: Metric
  cogs: Metric
  shipping: Metric
  transaction: Metric
  advertising: Metric
  byType: { type: CostType; amount: number }[]
}

export interface CampaignsPayload extends ResourcePage<CampaignRow> {
  campaignsSent: Metric
  openRate: Metric
  clickRate: Metric
  campaignRevenue: Metric
}

export interface ProfilesPayload extends ResourcePage<ProfileRow> {
  totalProfiles: Metric
  subscribed: Metric
  avgEngagement: Metric
  profileRevenue: Metric
}

export interface SentEmailsPayload extends ResourcePage<SentEmailRow> {
  sent: Metric
  opened: Metric
  clicked: Metric
  revenue: Metric
}
