/**
 * What a target implies, worked out from the period already on screen.
 *
 * Nothing here is stored or fetched. Every figure is derived from metrics the
 * cards above are rendering, so the plan cannot drift from them — a budget that
 * disagreed with the ad spend a few inches higher would discredit both.
 *
 * The advice is rules over those same figures rather than prose from a model.
 * Each note names the number it came from, which is what makes it checkable;
 * "shift spend to Google" is an opinion, "Google returns 4.1x against Meta's
 * 2.6x on 38% of the spend" is a reading.
 */
import type { BlendedAds, PlatformSpend } from './pnl'
import type {
  DateRange,
  MerchantFeed,
  Target,
  TargetNote,
  TargetPlan,
  WooMetrics,
} from './types'
import { daysInRange } from './dateRange'
import { formatCurrency, formatPercent, formatRoas } from './format'

/** Days in the horizon a target is set over. Calendar-average, not exact. */
const HORIZON_DAYS = { monthly: 30, quarterly: 91 } as const

/** Below this the return is treated as unknown rather than as poor. */
const MIN_MEANINGFUL_SPEND = 1

/**
 * A platform has to be carrying real money before its return is worth acting
 * on. A £20 test at 0.4x is noise, and advice to cut it reads as a finding.
 */
const MIN_PLATFORM_SPEND_SHARE = 0.1

export interface PlanInput {
  target: Target
  woo: WooMetrics | undefined
  blended: BlendedAds | null
  /** The period on screen, which is what pacing is measured over. */
  range: DateRange
  /** Feed health, where the Search & Feed tab has loaded it. */
  feed: MerchantFeed | undefined
}

export function planTarget({ target, woo, blended, range, feed }: PlanInput): TargetPlan {
  const days = HORIZON_DAYS[target.horizon]
  const perDay = target.budget / days

  const spend = blended?.spend ?? 0
  const periodDays = daysInRange(range)
  const pacingPerDay = blended ? spend / periodDays : null

  // The store's own return per ad pound, not a platform's claim about itself.
  // Unknown rather than zero below a token spend: dividing revenue by nothing
  // produces a number that says more about the divisor than the campaigns.
  const roas =
    blended && spend >= MIN_MEANINGFUL_SPEND ? blended.blendedRoas : null

  const isSales = target.goal === 'sales'

  // A sales goal divides into the budget it needs; a return goal is already a
  // rate and implies no budget of its own.
  const impliedBudget = isSales && roas && roas > 0 ? target.amount / roas : null
  const projected = isSales && roas ? target.budget * roas : null

  const attainment = attainmentOf(target, roas, projected)

  return {
    target,
    perDay,
    perWeek: perDay * 7,
    perMonth: perDay * 30,
    pacingPerDay,
    impliedBudget,
    projected,
    attainment,
    notes: adviseOn({
      target,
      roas,
      perDay,
      pacingPerDay,
      impliedBudget,
      projected,
      platforms: blended?.platforms ?? [],
      spend,
      woo,
      feed,
    }),
  }
}

/**
 * How much of the goal is in reach, 1 being on target.
 *
 * A sales goal measures the projection against the figure asked for. A return
 * goal measures the return itself, which is already a ratio — there is no
 * budget in it to divide.
 */
function attainmentOf(
  target: Target,
  roas: number | null,
  projected: number | null,
): number | null {
  if (target.amount <= 0) return null
  if (target.goal === 'roas') return roas === null ? null : roas / target.amount
  return projected === null ? null : projected / target.amount
}

interface AdviceInput {
  target: Target
  roas: number | null
  perDay: number
  pacingPerDay: number | null
  impliedBudget: number | null
  projected: number | null
  platforms: PlatformSpend[]
  spend: number
  woo: WooMetrics | undefined
  feed: MerchantFeed | undefined
}

/**
 * The advice, in the order an operator would act on it: whether the budget
 * reaches the goal at all, then where the money should sit, then what is
 * quietly stopping it working.
 */
function adviseOn(input: AdviceInput): TargetNote[] {
  const notes: TargetNote[] = []

  budgetNote(input, notes)
  pacingNote(input, notes)
  platformNote(input, notes)
  feedNote(input, notes)
  marginNote(input, notes)

  if (notes.length === 0) {
    notes.push({
      tone: 'warn',
      title: 'Not enough reported yet',
      detail:
        'No ad platform reported spend for this period, so there is no return to divide the goal by. Once Meta or Google reports, the budget this target needs can be worked out.',
    })
  }

  return notes
}

/** Whether the budget as set reaches the goal at the return being achieved. */
function budgetNote(
  { target, roas, impliedBudget, projected }: AdviceInput,
  notes: TargetNote[],
): void {
  if (roas === null) return

  if (target.goal === 'roas') {
    const hit = roas >= target.amount
    notes.push({
      tone: hit ? 'good' : 'bad',
      title: hit ? 'Return is above target' : 'Return is below target',
      detail: hit
        ? `Blended return is ${formatRoas(roas)} against a target of ${formatRoas(target.amount)}. The budget can rise without the return falling below target, so long as the extra spend performs like the spend already placed.`
        : `Blended return is ${formatRoas(roas)} against a target of ${formatRoas(target.amount)}. Raising the budget makes this worse, not better — the gap closes by improving what the spend buys, not by buying more of it.`,
    })
    return
  }

  if (impliedBudget === null || projected === null) return

  const shortfall = impliedBudget - target.budget
  // A percent either way is rounding, not a decision.
  const material = Math.abs(shortfall) > target.budget * 0.01

  if (!material) {
    notes.push({
      tone: 'good',
      title: 'Budget matches the goal',
      detail: `At ${formatRoas(roas)} blended return, ${formatCurrency(target.budget)} buys about ${formatCurrency(projected)} — near enough the ${formatCurrency(target.amount)} asked for.`,
    })
    return
  }

  notes.push({
    tone: shortfall > 0 ? 'bad' : 'good',
    title: shortfall > 0 ? 'Increase the budget' : 'Budget is more than the goal needs',
    detail:
      shortfall > 0
        ? `${formatCurrency(target.budget)} buys about ${formatCurrency(projected)} at the current ${formatRoas(roas)} return, short of ${formatCurrency(target.amount)}. Reaching it needs roughly ${formatCurrency(impliedBudget)} over the ${target.horizon === 'monthly' ? 'month' : 'quarter'} — ${formatCurrency(shortfall)} more — or a better return on what is already being spent.`
        : `${formatCurrency(target.budget)} would buy about ${formatCurrency(projected)} at the current ${formatRoas(roas)} return, past the ${formatCurrency(target.amount)} asked for. About ${formatCurrency(impliedBudget)} reaches it; the rest is available for another target.`,
  })
}

/** Whether current spend is on the pace the budget assumes. */
function pacingNote(
  { perDay, pacingPerDay, target }: AdviceInput,
  notes: TargetNote[],
): void {
  if (pacingPerDay === null || target.budget <= 0) return

  const gap = perDay - pacingPerDay
  // Under a tenth of the daily budget is drift, not a decision to make.
  if (Math.abs(gap) < perDay * 0.1) {
    notes.push({
      tone: 'good',
      title: 'Spending on pace',
      detail: `The plan allows ${formatCurrency(perDay)} a day and the period is running at ${formatCurrency(pacingPerDay)}. Nothing to change.`,
    })
    return
  }

  notes.push({
    tone: gap > 0 ? 'warn' : 'bad',
    title: gap > 0 ? 'Spending under pace' : 'Spending over pace',
    detail:
      gap > 0
        ? `The plan allows ${formatCurrency(perDay)} a day; the period is running at ${formatCurrency(pacingPerDay)}. At this rate the budget goes unspent and the goal goes unmet — raise daily spend by about ${formatCurrency(gap)}.`
        : `The plan allows ${formatCurrency(perDay)} a day; the period is running at ${formatCurrency(pacingPerDay)}, which is ${formatCurrency(-gap)} a day above it. The budget runs out before the ${target.horizon === 'monthly' ? 'month' : 'quarter'} does.`,
  })
}

/**
 * Where the money should sit, when one platform is plainly returning more than
 * another and is carrying enough spend for the comparison to mean something.
 */
function platformNote({ platforms, spend }: AdviceInput, notes: TargetNote[]): void {
  if (platforms.length < 2 || spend <= 0) return

  // Only platforms that both attribute and carry a real share. A platform that
  // reports no conversions has a zero return by omission, not by performance.
  const comparable = platforms.filter(
    (p) => p.roas > 0 && p.spend / spend >= MIN_PLATFORM_SPEND_SHARE,
  )
  if (comparable.length < 2) return

  const sorted = [...comparable].sort((a, b) => b.roas - a.roas)
  const best = sorted[0]
  const worst = sorted[sorted.length - 1]

  // Anything under a fifth apart is within the noise of attribution windows.
  if (best.roas < worst.roas * 1.2) {
    notes.push({
      tone: 'good',
      title: 'Platforms are returning alike',
      detail: `${best.name} returns ${formatRoas(best.roas)} and ${worst.name} ${formatRoas(worst.roas)} — close enough that moving money between them is not the lever. Growth comes from the budget or the creative.`,
    })
    return
  }

  notes.push({
    tone: 'warn',
    title: `Shift spend toward ${best.name}`,
    detail: `${best.name} returns ${formatRoas(best.roas)} against ${worst.name}'s ${formatRoas(worst.roas)}, and ${worst.name} is carrying ${formatPercent(worst.spend / spend)} of the spend — ${formatCurrency(worst.spend)}. Moving part of it is the cheapest available gain, since it costs nothing extra.`,
  })
}

/** Disapproved products, which quietly cap what Shopping spend can buy. */
function feedNote({ feed }: AdviceInput, notes: TargetNote[]): void {
  if (!feed) return

  const { active, disapproved } = feed.totals
  if (disapproved === 0 || active + disapproved === 0) return

  const share = disapproved / (active + disapproved)
  notes.push({
    tone: share > 0.1 ? 'bad' : 'warn',
    title: 'Part of the catalogue cannot serve',
    detail: `${disapproved} product listings are disapproved in Merchant Center, ${formatPercent(share)} of the feed. Shopping spend is bidding on a reduced catalogue, so the return is being measured against less than the full range — fixing these raises what the same budget buys.`,
  })
}

/** Whether the sales the goal asks for are worth having at the current margin. */
function marginNote({ woo, target, projected }: AdviceInput, notes: TargetNote[]): void {
  if (!woo || target.goal !== 'sales' || projected === null) return

  const margin = woo.grossMargin.value
  if (margin <= 0) return

  // The goods behind the sales have to cost less than the sales bring in before
  // any of this is worth doing; the ad spend comes out of what is left.
  const grossOnGoal = target.amount * margin
  if (grossOnGoal > target.budget) return

  notes.push({
    tone: 'bad',
    title: 'The goal costs more than it earns',
    detail: `At ${formatPercent(margin)} gross margin, ${formatCurrency(target.amount)} of sales leaves about ${formatCurrency(grossOnGoal)} before advertising — less than the ${formatCurrency(target.budget)} budgeted to win it. The target is unprofitable as set, whatever the return on the ads.`,
  })
}
