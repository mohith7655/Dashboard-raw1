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
  /** Today in the store's calendar, so a deadline is counted in its days. */
  today: string
}

/**
 * Days from `today` to `deadline`, counting both. Zero once it has passed.
 *
 * Clamped at zero rather than going negative: an overdue target is reported as
 * overdue, and a negative divisor would print a negative daily spend as though
 * the store were owed money.
 */
export function daysUntil(today: string, deadline: string): number {
  const from = Date.parse(`${today}T00:00:00Z`)
  const to = Date.parse(`${deadline}T00:00:00Z`)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0
  return Math.max(0, Math.round((to - from) / 86_400_000) + 1)
}

export function planTarget({
  target,
  woo,
  blended,
  range,
  feed,
  today,
}: PlanInput): TargetPlan {
  const daysLeft = daysUntil(today, target.deadline)

  const spend = blended?.spend ?? 0
  const periodDays = daysInRange(range)
  const pacingPerDay = blended ? spend / periodDays : null

  // The store's own return per ad pound, not a platform's claim about itself.
  // Unknown rather than zero below a token spend: dividing revenue by nothing
  // produces a number that says more about the divisor than the campaigns.
  const roas =
    blended && spend >= MIN_MEANINGFUL_SPEND ? blended.blendedRoas : null

  const isSales = target.goal === 'sales'

  /**
   * The sales the percentage is a percentage of.
   *
   * A sales goal names it outright. A return goal does not, so the store's own
   * run rate over the days remaining stands in — which makes the budget the
   * same quantity the All ads card calls "spend % of sales", measured against
   * what the store is actually on pace to sell.
   */
  const salesBasis = isSales
    ? target.amount
    : woo
      ? (woo.totalRevenue.value / periodDays) * daysLeft
      : 0

  const budget = (salesBasis * target.budgetPct) / 100

  // A sales goal divides into the budget it needs; a return goal is already a
  // rate and implies no budget of its own.
  const impliedBudget = isSales && roas && roas > 0 ? target.amount / roas : null
  const projected = isSales && roas ? budget * roas : null

  const attainment = attainmentOf(target, roas, projected)

  // With no budget set, the split is struck from the one the goal implies —
  // which is the figure the reader came for. Zero only survives where there is
  // no implied budget either, and then there is genuinely nothing to divide.
  const basisIsImplied = budget <= 0 && impliedBudget !== null
  const budgetBasis = basisIsImplied ? (impliedBudget as number) : budget
  // Divided by the days that are left, not by the days the target covers. With
  // a week to go on a quarterly goal, the money still to spend has a week to be
  // spent in, and a rate that said otherwise would be arithmetic about the past.
  const perDay = daysLeft > 0 ? budgetBasis / daysLeft : 0

  return {
    target,
    budgetBasis,
    basisIsImplied,
    daysLeft,
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
      basisIsImplied,
      budget,
      daysLeft,
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
  /** The daily figure is a recommendation, not a plan the operator set. */
  basisIsImplied: boolean
  /** The percentage resolved into money, for the window that is left. */
  budget: number
  daysLeft: number
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
  { target, roas, budget, daysLeft, impliedBudget, projected }: AdviceInput,
  notes: TargetNote[],
): void {
  // A deadline that has passed is the first thing worth saying, and it makes
  // every rate below it a division by nothing.
  if (daysLeft === 0) {
    notes.push({
      tone: 'bad',
      title: 'The target date has passed',
      detail: `${target.name} was due by ${target.deadline}. Move the date to plan against it, or remove it — a rate cannot be struck against days that are gone.`,
    })
    return
  }

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

  // No budget entered at all. Nothing has been decided yet, so this states the
  // cost rather than reporting a shortfall against a figure nobody set.
  if (budget <= 0) {
    notes.push({
      tone: 'warn',
      title: 'No budget set yet',
      detail: `At the current ${formatRoas(roas)} blended return, ${formatCurrency(target.amount)} of sales needs roughly ${formatCurrency(impliedBudget)} of ad spend — ${formatPercent(impliedBudget / target.amount)} of the target. The daily and weekly figures above are that budget spread over the ${daysLeft} days left; set a budget percentage to plan against your own number instead.`,
    })
    return
  }

  const shortfall = impliedBudget - budget
  // A percent either way is rounding, not a decision.
  const material = Math.abs(shortfall) > budget * 0.01

  if (!material) {
    notes.push({
      tone: 'good',
      title: 'Budget matches the goal',
      detail: `At ${formatRoas(roas)} blended return, ${formatPercent(target.budgetPct / 100)} of the target — ${formatCurrency(budget)} — buys about ${formatCurrency(projected)}, near enough the ${formatCurrency(target.amount)} asked for.`,
    })
    return
  }

  notes.push({
    tone: shortfall > 0 ? 'bad' : 'good',
    title: shortfall > 0 ? 'Increase the budget' : 'Budget is more than the goal needs',
    detail:
      shortfall > 0
        ? `${formatPercent(target.budgetPct / 100)} of the target is ${formatCurrency(budget)}, which buys about ${formatCurrency(projected)} at the current ${formatRoas(roas)} return — short of ${formatCurrency(target.amount)}. Reaching it needs roughly ${formatCurrency(impliedBudget)}, or ${formatPercent(impliedBudget / target.amount)} of the target: ${formatCurrency(shortfall)} more over the ${daysLeft} days left, or a better return on what is already being spent.`
        : `${formatPercent(target.budgetPct / 100)} of the target is ${formatCurrency(budget)}, which would buy about ${formatCurrency(projected)} at the current ${formatRoas(roas)} return — past the ${formatCurrency(target.amount)} asked for. About ${formatPercent(impliedBudget / target.amount)} reaches it; the rest is available for another target.`,
  })
}

/** Whether current spend is on the pace the budget assumes. */
function pacingNote(
  { perDay, basisIsImplied, pacingPerDay, daysLeft }: AdviceInput,
  notes: TargetNote[],
): void {
  // Runs against the recommended daily figure too, not only an entered one:
  // "the goal needs £121 a day and you are spending £258" is the same useful
  // sentence whichever side of it the reader supplied.
  if (pacingPerDay === null || perDay <= 0) return

  const allows = basisIsImplied ? 'The goal needs' : 'The plan allows'
  const gap = perDay - pacingPerDay

  // Under a tenth of the daily budget is drift, not a decision to make.
  if (Math.abs(gap) < perDay * 0.1) {
    notes.push({
      tone: 'good',
      title: 'Spending on pace',
      detail: `${allows} ${formatCurrency(perDay)} a day and the period is running at ${formatCurrency(pacingPerDay)}. Nothing to change.`,
    })
    return
  }

  notes.push({
    tone: gap > 0 ? 'warn' : 'bad',
    title: gap > 0 ? 'Spending under pace' : 'Spending over pace',
    detail:
      gap > 0
        ? `${allows} ${formatCurrency(perDay)} a day; the period is running at ${formatCurrency(pacingPerDay)}. At this rate the goal goes unmet — raise daily spend by about ${formatCurrency(gap)}.`
        : `${allows} ${formatCurrency(perDay)} a day; the period is running at ${formatCurrency(pacingPerDay)}, which is ${formatCurrency(-gap)} a day above it. ${
            basisIsImplied
              ? 'The goal is already funded at this rate — the spend is ahead of what it requires.'
              : `The budget runs out with ${daysLeft} days still to go.`
          }`,
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
function marginNote(
  { woo, target, budget, projected }: AdviceInput,
  notes: TargetNote[],
): void {
  if (!woo || target.goal !== 'sales' || projected === null) return

  const margin = woo.grossMargin.value
  if (margin <= 0) return

  // The goods behind the sales have to cost less than the sales bring in before
  // any of this is worth doing; the ad spend comes out of what is left.
  const grossOnGoal = target.amount * margin
  if (grossOnGoal > budget) return

  notes.push({
    tone: 'bad',
    title: 'The goal costs more than it earns',
    detail: `At ${formatPercent(margin)} gross margin, ${formatCurrency(target.amount)} of sales leaves about ${formatCurrency(grossOnGoal)} before advertising — less than the ${formatCurrency(budget)} budgeted to win it. The target is unprofitable as set, whatever the return on the ads.`,
  })
}
