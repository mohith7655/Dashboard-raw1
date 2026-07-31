/**
 * Views that are built entirely from figures the dashboard already loads —
 * no extra upstream calls, so every tab answers its question at a glance.
 */
import type { AdsMetrics, WooMetrics } from './types'
import { round2 } from './derive'
import { formatCurrency } from './format'

/* ----------------------------- Profit & loss ---------------------------- */

export type StepKind = 'total' | 'decrease'

export interface WaterfallStep {
  label: string
  /** Signed contribution; totals restate the running figure instead of moving it. */
  amount: number
  kind: StepKind
  /** `[start, end]` on the value axis — Recharts draws this as a floating bar. */
  range: [number, number]
  /** The running figure after this step, for the tooltip. */
  running: number
  /** Pre-formatted direct label, so colour is never the only cue. */
  valueLabel: string
}

/**
 * Revenue down to profit, one deduction per bar. Ad spend and the net-profit
 * total only appear when at least one ad platform reported, rather than
 * drawing a zero step that reads as "we spent nothing".
 */
export function profitWaterfall(
  woo: WooMetrics,
  adSpend: number | null,
): WaterfallStep[] {
  const steps: WaterfallStep[] = []
  let running = 0

  const total = (label: string, value: number): void => {
    running = round2(value)
    steps.push({
      label,
      amount: running,
      kind: 'total',
      range: [Math.min(0, running), Math.max(0, running)],
      running,
      valueLabel: formatCurrency(running),
    })
  }

  const deduct = (label: string, amount: number): void => {
    const next = round2(running - amount)
    steps.push({
      label,
      amount: -round2(amount),
      kind: 'decrease',
      range: [Math.min(running, next), Math.max(running, next)],
      running: next,
      valueLabel: `−${formatCurrency(amount)}`,
    })
    running = next
  }

  total('Revenue', woo.totalRevenue.value)
  deduct('Product cost', woo.productCost.value)
  deduct('Shipping', woo.shippingCost.value)
  deduct('Transaction', woo.transactionCost.value)
  total('Gross profit', woo.grossProfit.value)

  if (adSpend !== null) {
    deduct('Ad spend', adSpend)
    total('Net profit', running)
  }

  return steps
}

/* -------------------------------- Shipping ------------------------------ */

export interface CostSlice {
  label: string
  amount: number
  /** Share of total cost, 0..1. */
  share: number
}

export interface ShippingEconomics {
  cost: number
  perOrder: number
  shareOfRevenue: number
  shareOfCost: number
  /** Where each cost dollar goes, largest first. */
  mix: CostSlice[]
}

const ratio = (a: number, b: number): number => (b === 0 ? 0 : a / b)

export function shippingEconomics(woo: WooMetrics): ShippingEconomics {
  const cost = woo.shippingCost.value
  const totalCost = woo.totalCost.value
  const slices: CostSlice[] = [
    { label: 'Product', amount: woo.productCost.value, share: ratio(woo.productCost.value, totalCost) },
    { label: 'Shipping', amount: cost, share: ratio(cost, totalCost) },
    { label: 'Transaction', amount: woo.transactionCost.value, share: ratio(woo.transactionCost.value, totalCost) },
  ]

  return {
    cost,
    perOrder: round2(ratio(cost, woo.totalOrders.value)),
    shareOfRevenue: ratio(cost, woo.totalRevenue.value),
    shareOfCost: ratio(cost, totalCost),
    mix: slices.sort((a, b) => b.amount - a.amount),
  }
}

/* -------------------------------- Ad spend ------------------------------ */

export interface PlatformSpend {
  name: string
  spend: number
  roas: number
  conversions: number
}

export interface BlendedAds {
  spend: number
  /** Store revenue per ad dollar — not the platform-attributed figure. */
  blendedRoas: number
  shareOfRevenue: number
  costPerOrder: number
  platforms: PlatformSpend[]
}

/**
 * Blends whichever platforms answered. A platform that failed is left out
 * entirely so its silence never reads as zero spend.
 */
export function blendedAds(
  woo: WooMetrics | undefined,
  reported: { name: string; metrics: AdsMetrics }[],
): BlendedAds | null {
  if (reported.length === 0) return null

  const platforms: PlatformSpend[] = reported.map(({ name, metrics }) => ({
    name,
    spend: metrics.spend.value,
    roas: metrics.roas.value,
    conversions: metrics.conversions.value,
  }))
  const spend = round2(platforms.reduce((sum, p) => sum + p.spend, 0))
  const revenue = woo?.totalRevenue.value ?? 0

  return {
    spend,
    blendedRoas: ratio(revenue, spend),
    shareOfRevenue: ratio(spend, revenue),
    costPerOrder: round2(ratio(spend, woo?.totalOrders.value ?? 0)),
    platforms,
  }
}
