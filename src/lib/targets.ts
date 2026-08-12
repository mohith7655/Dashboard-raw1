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
  AimPlan,
  DateRange,
  TargetProgress,
  MerchantFeed,
  Target,
  TargetAim,
  TargetGoal,
  TargetNote,
  TargetPlan,
  WooMetrics,
} from './types'
import { TARGET_GOALS, TARGET_GOAL_LABELS, isMoneyGoal } from './types'
import { monthStart } from './dateRange'
import { formatCurrency, formatList, formatPercent, formatRoas } from './format'

/** Below this the return is treated as unknown rather than as poor. */
const MIN_MEANINGFUL_SPEND = 1

/**
 * A platform has to be carrying real money before its return is worth acting
 * on. A £20 test at 0.4x is noise, and advice to cut it reads as a finding.
 */
const MIN_PLATFORM_SPEND_SHARE = 0.1

export interface PlanInput {
  target: Target
  /**
   * What the target's own window has done so far, fetched for that window
   * rather than for the range in the picker. Null while it is loading or if
   * the fetch failed, which leaves the figures unknown rather than answering
   * from a period the target says nothing about.
   */
  progress: TargetProgress | null
  /**
   * The store's recent trading, over the period on screen, in the same shape.
   *
   * Stands in for the window's own rates where the window has none — a target
   * that starts next month has no history of its own, and refusing to plan for
   * it at all is what left a future target with nothing but "not started yet".
   * Never used for what is banked: a window that has not opened has banked
   * nothing, whatever the store did last month.
   */
  baseline: TargetProgress | null
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
 * The aims a target carries, in the canonical order rather than the order they
 * happened to be clicked in — so two targets aiming at the same pair read the
 * same way, and the anchor below is picked deterministically.
 */
export function orderedAims(target: Target): TargetAim[] {
  return [...target.aims].sort(
    (a, b) => TARGET_GOALS.indexOf(a.goal) - TARGET_GOALS.indexOf(b.goal),
  )
}

/**
 * The aim the budget is struck against.
 *
 * A budget is a percentage of sales, so it needs a sales-like figure to be a
 * percentage of. Revenue first, then sales, then profit — profit last because
 * it is the poorest base for the share (a 20% budget against profit is a much
 * larger share of trading than the same figure against revenue), but it still
 * beats having no base at all. A return-only target has none, and falls back
 * to the store's own run rate.
 */
function anchorOf(aims: TargetAim[]): TargetAim | null {
  for (const goal of ['revenue', 'sales', 'profit'] as TargetGoal[]) {
    const found = aims.find((aim) => aim.goal === goal && aim.amount > 0)
    if (found) return found
  }
  return null
}

/**
 * What the window has banked on this measure so far.
 *
 * Read off the target's own window, not the range on screen. A target running
 * to the end of the month has already had sales made towards it, and asking
 * the store to earn the whole goal again from today is the arithmetic this
 * replaces.
 */
function achievedOn(goal: TargetGoal, progress: TargetProgress): number | null {
  if (goal === 'roas') return progress.roas
  if (goal === 'revenue') return progress.revenue
  if (goal === 'sales') return progress.sales
  return progress.profit
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

/** True where `a` falls strictly before `b`, both `yyyy-MM-dd`. */
const before = (a: string, b: string): boolean => a < b

/**
 * The day a target's window actually begins.
 *
 * The date typed, or the first of its month where the target counts from
 * there. One definition, exported, because the plan and the fetch that feeds
 * it must agree on this to the day — two answers here would have the card
 * banking figures from a window it was not measuring.
 */
export function effectiveStart(target: Target): string {
  return target.countFromMonthStart ? monthStart(target.start) : target.start
}

export function planTarget({
  target,
  progress,
  baseline,
  woo,
  blended,
  range,
  feed,
  today,
}: PlanInput): TargetPlan {
  // The window in full, and how much of it is still to run.
  //
  // Before the start date the whole window is left rather than the shorter
  // count back from the deadline: a target beginning next month is not one
  // whose daily rate should already be climbing, and dividing by days it is
  // not meant to be traded in would understate every figure below.
  const opens = effectiveStart(target)
  const windowDays = Math.max(1, daysUntil(opens, target.deadline))
  const notStarted = before(today, opens)
  const daysLeft = notStarted ? windowDays : daysUntil(today, target.deadline)
  const daysElapsed = Math.max(0, windowDays - daysLeft)

  // What the window has actually banked and spent. Always the window's own —
  // the range in the picker decides what the cards above show, and has no
  // business deciding what a target that names its own dates has achieved.
  const spentSoFar = progress?.spend ?? 0

  /**
   * The rates to plan at: the window's own where it has traded, the store's
   * recent trading where it has not.
   *
   * A target beginning next month has no history of its own, and a plan that
   * refused to divide anything until the window opened told its reader only
   * that it had not opened. The store's current performance is the best
   * available estimate of what the window will do, and the card says outright
   * which of the two it used.
   */
  const hasOwnTrading = !!progress && progress.days > 0 && progress.spend > 0
  const rates = hasOwnTrading ? progress : baseline
  const basis: TargetPlan['basis'] = hasOwnTrading
    ? 'window'
    : rates
      ? 'recent'
      : 'none'

  const pacingPerDay = rates && rates.days > 0 ? rates.spend / rates.days : null

  // Blended return over those rates: store revenue per ad pound, not a
  // platform's claim about itself. Unknown rather than zero below a token
  // spend, since dividing revenue by nothing says more about the divisor than
  // the campaigns.
  const roas = returnOn('roas', rates)

  const aims = orderedAims(target)
  const anchor = anchorOf(aims)
  const roasAim = aims.find((aim) => aim.goal === 'roas') ?? null

  /**
   * The sales the percentage is a percentage of.
   *
   * A money aim names it outright. A return-only target does not, so the
   * window's own run rate stands in — which makes the budget the same quantity
   * the All ads card calls "spend % of sales", measured against what the store
   * is actually on pace to sell across the whole window.
   */
  const salesBasis = anchor
    ? anchor.amount
    : rates && rates.days > 0
      ? (rates.revenue / rates.days) * windowDays
      : 0

  const budget = (salesBasis * target.budgetPct) / 100

  // A money aim divides into the budget it needs; a return aim is already a
  // rate and implies no budget of its own.
  //
  // Struck against what is still to earn rather than the whole goal, and added
  // to what has already gone out: the money already spent bought the sales
  // already banked, and charging the store for those a second time is exactly
  // the error this plan used to make.
  //
  // Struck at the return on the anchor's *own* measure, not at blended ROAS:
  // $50,000 of net profit and $50,000 of revenue do not cost the same to buy.
  const anchorBanked = anchor ? (achievedFor(anchor.goal, progress) ?? 0) : 0
  const anchorReturn = anchor ? returnOn(anchor.goal, rates) : null
  const stillToEarn = anchor ? Math.max(0, anchor.amount - anchorBanked) : 0
  const impliedBudget =
    anchor && anchorReturn ? spentSoFar + stillToEarn / anchorReturn : null
  const projected =
    anchor && anchorReturn
      ? anchorBanked + Math.max(0, budget - spentSoFar) * anchorReturn
      : null

  const attainment = attainmentOf(anchor, roasAim, roas, projected)

  // With no budget set, the split is struck from the one the goal implies —
  // which is the figure the reader came for. Zero only survives where there is
  // no implied budget either, and then there is genuinely nothing to divide.
  const basisIsImplied = budget <= 0 && impliedBudget !== null
  const budgetBasis = basisIsImplied ? (impliedBudget as number) : budget
  // What is left of it, and the rate that spends the remainder over the days
  // that remain. Divided by the days that are left, not by the days the target
  // covers: with a week to go on a quarterly goal, the money still to spend has
  // a week to be spent in, and a rate that said otherwise would be arithmetic
  // about the past.
  const budgetRemaining = Math.max(0, budgetBasis - spentSoFar)
  const perDay = daysLeft > 0 ? budgetRemaining / daysLeft : 0

  const aimPlans = aims.map((aim): AimPlan => {
    const achieved = achievedFor(aim.goal, progress)

    // A return does not accumulate: two months at 3x is 3x, not 6x. So the
    // return aim's run rate is the return itself, it banks nothing towards a
    // total, and its pace is that same figure.
    if (aim.goal === 'roas') {
      return {
        goal: aim.goal,
        amount: aim.amount,
        perDay: null,
        perWeek: null,
        perMonth: null,
        achieved,
        remaining: null,
        runRate: roas,
        pace: roas,
        paceAttainment: roas === null || aim.amount <= 0 ? null : roas / aim.amount,
      }
    }

    /**
     * What is left to find, at the rate it now has to be found — and the rate
     * the window is actually running at against it.
     *
     * The remainder rather than the whole goal: half a month in with half the
     * money already taken, the daily figure that matters is what the rest of
     * the month has to do, not what the month as a whole would have needed
     * from a standing start.
     */
    const remaining = achieved === null ? null : Math.max(0, aim.amount - achieved)
    const goalPerDay =
      remaining === null ? null : daysLeft > 0 ? remaining / daysLeft : null
    // The rate comes from whichever basis is in play; what is banked never
    // does. A window that has not opened has earned nothing, however well the
    // store has been trading lately.
    const rateSource = achievedOnRates(aim.goal, rates)
    const runRate =
      rates && rates.days > 0 && rateSource !== null ? rateSource / rates.days : null
    // Where it finishes if trading holds: banked plus the run rate over what
    // is left. The old figure projected the run rate alone and so reported a
    // half-finished target as though nothing had been earned yet.
    const banked = achieved ?? 0
    const pace = runRate === null ? null : banked + runRate * daysLeft

    return {
      goal: aim.goal,
      amount: aim.amount,
      perDay: goalPerDay,
      perWeek: goalPerDay === null ? null : goalPerDay * 7,
      perMonth: goalPerDay === null ? null : goalPerDay * 30,
      achieved,
      remaining,
      runRate,
      pace,
      paceAttainment: pace === null || aim.amount <= 0 ? null : pace / aim.amount,
    }
  })

  return {
    target,
    progress,
    basis,
    budgetBasis,
    budgetRemaining,
    basisIsImplied,
    daysLeft,
    windowDays,
    daysElapsed,
    notStarted,
    perDay,
    perWeek: perDay * 7,
    perMonth: perDay * 30,
    aims: aimPlans,
    pacingPerDay,
    impliedBudget,
    projected,
    attainment,
    notes: adviseOn({
      target,
      anchor,
      roasAim,
      aimPlans,
      roas,
      perDay,
      basisIsImplied,
      basis,
      anchorReturn,
      budget,
      spentSoFar,
      daysLeft,
      windowDays,
      notStarted,
      pacingPerDay,
      impliedBudget,
      projected,
      platforms: blended?.platforms ?? [],
      spend: progress?.spend ?? 0,
      woo,
      feed,
      range,
    }),
  }
}

/** `achievedOn` over whichever basis is in play, which may be absent. */
const achievedOnRates = (
  goal: TargetGoal,
  rates: TargetProgress | null,
): number | null => (rates ? achievedOn(goal, rates) : null)

/** `achievedOn` through a progress that may not have arrived yet. */
const achievedFor = (
  goal: TargetGoal,
  progress: TargetProgress | null,
): number | null => (progress ? achievedOn(goal, progress) : null)

/**
 * What an ad pound returns *on this measure*.
 *
 * Not one return for every goal. A revenue goal is reached at revenue per ad
 * pound; a profit goal is reached at profit per ad pound, which on a 40% margin
 * store is a fraction of it. Dividing a profit goal by the revenue return —
 * which this did — understates what the goal costs by the whole of the margin
 * and the overheads, and on a large goal that is not a rounding error but a
 * budget that cannot possibly reach it.
 *
 * A return aim keeps the conventional meaning: revenue over spend.
 */
function returnOn(goal: TargetGoal, rates: TargetProgress | null): number | null {
  if (!rates || rates.spend < MIN_MEANINGFUL_SPEND) return null
  const earned = goal === 'roas' ? rates.revenue : achievedOn(goal, rates)
  if (earned === null) return null
  // A loss-making measure has no positive return to divide a goal by. Reported
  // as unknown rather than as a negative budget, which would read as money owed.
  return earned <= 0 ? null : earned / rates.spend
}

/**
 * How much of the goal is in reach, 1 being on target.
 *
 * A money aim measures the projection against the figure asked for. A return
 * aim measures the return itself, which is already a ratio — there is no
 * budget in it to divide. Where a target carries both, the money aim wins:
 * that is the one the budget on the card was struck against.
 */
function attainmentOf(
  anchor: TargetAim | null,
  roasAim: TargetAim | null,
  roas: number | null,
  projected: number | null,
): number | null {
  if (anchor) return projected === null ? null : projected / anchor.amount
  if (!roasAim || roasAim.amount <= 0) return null
  return roas === null ? null : roas / roasAim.amount
}

interface AdviceInput {
  target: Target
  /** The money aim the budget is struck against, if the target set one. */
  anchor: TargetAim | null
  roasAim: TargetAim | null
  aimPlans: AimPlan[]
  roas: number | null
  perDay: number
  /** The daily figure is a recommendation, not a plan the operator set. */
  basisIsImplied: boolean
  basis: TargetPlan['basis']
  /** The return on the anchor's own measure, which is what its budget buys. */
  anchorReturn: number | null
  /** The percentage resolved into money, across the whole window. */
  budget: number
  /** What the window has already spent against that budget. */
  spentSoFar: number
  daysLeft: number
  windowDays: number
  notStarted: boolean
  pacingPerDay: number | null
  impliedBudget: number | null
  projected: number | null
  platforms: PlatformSpend[]
  spend: number
  woo: WooMetrics | undefined
  feed: MerchantFeed | undefined
  /** The period on screen, named where a note has to say which it is not. */
  range: DateRange
}

/**
 * The advice, in the order an operator would act on it: whether the budget
 * reaches the goal at all, then where the money should sit, then what is
 * quietly stopping it working.
 */
function adviseOn(input: AdviceInput): TargetNote[] {
  const notes: TargetNote[] = []

  windowNote(input, notes)
  reachabilityNote(input, notes)
  budgetNote(input, notes)
  paceNote(input, notes)
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

/**
 * How the plan was struck, and — for a window that has not opened — what to
 * have ready for the day it does.
 *
 * A future target used to get one line saying it had not started, and nothing
 * else: every note below it bailed out for want of a return to divide by. That
 * is exactly backwards. A target set in advance is set in advance so that the
 * spending can be arranged before it begins, and the questions worth answering
 * — what it will cost, what to book, when to start — are all answerable from
 * how the store is trading now.
 */
function windowNote(input: AdviceInput, notes: TargetNote[]): void {
  const {
    target,
    anchor,
    anchorReturn,
    basis,
    notStarted,
    windowDays,
    impliedBudget,
    budget,
    daysLeft,
  } = input
  if (basis === 'none') {
    notes.push({
      tone: 'warn',
      title: 'Nothing to plan from yet',
      detail: `Neither ${target.name}'s own window nor the period on screen has any ad spend in it, so there is no return to divide the goal by. Once a platform reports, the budget this target needs can be worked out.`,
    })
    return
  }

  if (notStarted) {
    // What to have ready, but only where there is a budget worth readying. At
    // a return that cannot reach the goal, prescribing a daily figure would
    // contradict the note directly below it.
    if (unreachable(input)) {
      notes.push({
        tone: 'warn',
        title: `Starts ${effectiveStart(target)} — the return has to change first`,
        detail: `${target.name} runs ${windowDays} days from ${effectiveStart(target)} and nothing has been spent against it. There is time to act, but not by setting budgets: at the rate the store is currently returning the goal cannot be bought at any budget, for the reason in the next note. The window to use is the one before it opens — margin, cost of goods, or what the advertising returns.`,
      })
      return
    }

    // The daily figure has to come from the same budget the sentence names.
    // Quoting what the goal needs and then dividing the entered budget by the
    // days printed two numbers that did not reconcile.
    const needed = impliedBudget ?? 0
    const neededPerDay = daysLeft > 0 ? needed / daysLeft : 0

    const money = anchor
      ? `At the ${formatRoas(anchorReturn ?? 0)} of ${TARGET_GOAL_LABELS[anchor.goal].toLowerCase()} per ad dollar the store is currently returning, ${formatCurrency(anchor.amount)} needs about ${formatCurrency(needed)} of ad spend across the ${windowDays} days — ${formatCurrency(neededPerDay)} a day, ${formatCurrency(neededPerDay * 7)} a week.${
          budget > 0 && Math.abs(budget - needed) > budget * 0.01
            ? ` The ${formatPercent(target.budgetPct / 100)} budget set is ${formatCurrency(budget)}, ${formatCurrency(budget / windowDays)} a day.`
            : ''
        }`
      : `The rates below are struck across the whole ${windowDays}-day window.`

    notes.push({
      tone: 'warn',
      title: `Starts ${effectiveStart(target)} — book the budget now`,
      detail: `${money} Nothing has been spent against it yet, and the figures are estimated from how the store is trading now rather than from the window itself, which has no history. Three things to have ready before it opens: daily budgets totalling ${formatCurrency(neededPerDay)} across the platforms, the creative and landing pages live the day before, and a note of today's return — ${formatRoas(anchorReturn ?? 0)} — to check the first week against.`,
    })
    return
  }

  if (basis === 'recent') {
    notes.push({
      tone: 'warn',
      title: 'Estimated from recent trading',
      detail: `The window has opened but nothing has been spent in it yet, so the figures below are struck from the period on screen rather than from the target's own days. They will move once spending starts${budget > 0 ? `, and the ${formatCurrency(budget)} budget has ${daysLeft} days to go out over` : ''}.`,
    })
  }
}

/**
 * Whether the goal can be bought at all, before any question of how much.
 *
 * Ranked above the budget note because it decides whether that note has
 * anything to say: telling a reader to raise a budget towards a goal no budget
 * reaches is the worst advice this section could give, and the two used to
 * print one under the other.
 */
function reachabilityNote(input: AdviceInput, notes: TargetNote[]): void {
  const { anchor, anchorReturn, impliedBudget } = input
  // The plainest version of the same problem, and it applies to every money
  // goal: the advertising to reach it costs more than the goal is worth. On a
  // profit goal it is the whole story — a return below 1.0 means each ad
  // dollar brings back less than a dollar of profit, so no budget reaches the
  // target and a bigger one only widens the hole.
  if (!unreachable(input)) return
  if (anchor && impliedBudget !== null) {
    const goal = TARGET_GOAL_LABELS[anchor.goal].toLowerCase()
    notes.push({
      tone: 'bad',
      title: 'The goal costs more than it is worth',
      detail: `Reaching ${formatCurrency(anchor.amount)} of ${goal} needs about ${formatCurrency(impliedBudget)} of advertising at the ${formatRoas(anchorReturn ?? 0)} of ${goal} per ad dollar being achieved — more than the goal itself.${
        anchor.goal === 'profit'
          ? ' A return below 1.0x means every dollar spent brings back less than a dollar of profit, so no budget reaches this target; the lever is margin, cost of goods or the return on the ads, not the size of the spend.'
          : ' Either the goal is set too high for the current return, or the return has to improve before the budget can be raised to chase it.'
      }`,
    })
  }
}

/** True where the advertising to reach the goal costs more than the goal. */
function unreachable({ anchor, impliedBudget }: AdviceInput): boolean {
  return !!anchor && impliedBudget !== null && impliedBudget > anchor.amount
}

/** Whether the budget as set reaches the goal at the return being achieved. */
function budgetNote(
  {
    target,
    anchor,
    anchorReturn,
    roasAim,
    roas,
    basis,
    budget,
    spentSoFar,
    daysLeft,
    impliedBudget,
    projected,
  }: AdviceInput,
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

  // A return aim gets its own note whether or not a money aim sits beside it:
  // the two take opposite advice about the budget, and a target carrying both
  // is precisely where saying only one of them would mislead.
  if (roasAim && roasAim.amount > 0) {
    const hit = roas >= roasAim.amount
    notes.push({
      tone: hit ? 'good' : 'bad',
      title: hit ? 'Return is above target' : 'Return is below target',
      detail: hit
        ? `Blended return is ${formatRoas(roas)} against a target of ${formatRoas(roasAim.amount)}. The budget can rise without the return falling below target, so long as the extra spend performs like the spend already placed.`
        : `Blended return is ${formatRoas(roas)} against a target of ${formatRoas(roasAim.amount)}. Raising the budget makes this worse, not better — the gap closes by improving what the spend buys, not by buying more of it.${
            anchor
              ? ` That pulls against the ${TARGET_GOAL_LABELS[anchor.goal].toLowerCase()} aim on this target, which the budget note below says to spend into — meeting both means a better return, not a bigger one.`
              : ''
          }`,
    })
  }

  // Said already, and better, by the note above: at a return this low the
  // answer is not a bigger budget.
  if (!anchor || impliedBudget === null || projected === null) return
  if (impliedBudget > anchor.amount) return

  const goalName = TARGET_GOAL_LABELS[anchor.goal].toLowerCase()
  // The return on the anchor's own measure. Quoting blended ROAS here while
  // dividing by this one would print a sentence whose arithmetic does not work.
  const rate = formatRoas(anchorReturn ?? 0)
  const source = basis === 'window' ? 'the window is returning' : 'the store is currently returning'

  // No budget entered at all. Nothing has been decided yet, so this states the
  // cost rather than reporting a shortfall against a figure nobody set.
  if (budget <= 0) {
    notes.push({
      tone: 'warn',
      title: 'No budget set yet',
      detail: `At the ${rate} of ${goalName} per ad dollar ${source}, ${formatCurrency(anchor.amount)} needs roughly ${formatCurrency(impliedBudget)} of ad spend in total — ${formatPercent(impliedBudget / anchor.amount)} of the target, of which ${formatCurrency(spentSoFar)} has already gone out. The daily and weekly figures above spread what is left over the ${daysLeft} days remaining; set a budget percentage to plan against your own number instead.`,
    })
    return
  }

  const shortfall = impliedBudget - budget
  // A percent either way is rounding, not a decision.
  const material = Math.abs(shortfall) > budget * 0.01

  if (!material) {
    notes.push({
      tone: 'good',
      title: `Budget matches the ${goalName} goal`,
      detail: `At the ${rate} of ${goalName} per ad dollar ${source}, ${formatPercent(target.budgetPct / 100)} of the target — ${formatCurrency(budget)}, of which ${formatCurrency(spentSoFar)} is spent — finishes at about ${formatCurrency(projected)}, near enough the ${formatCurrency(anchor.amount)} of ${goalName} asked for.`,
    })
    return
  }

  notes.push({
    tone: shortfall > 0 ? 'bad' : 'good',
    title: shortfall > 0 ? 'Increase the budget' : 'Budget is more than the goal needs',
    detail:
      shortfall > 0
        ? `${formatPercent(target.budgetPct / 100)} of the target is ${formatCurrency(budget)}, of which ${formatCurrency(spentSoFar)} is already spent. At the ${rate} of ${goalName} per ad dollar ${source}, that finishes at about ${formatCurrency(projected)} — short of the ${formatCurrency(anchor.amount)} of ${goalName} asked for. Reaching it needs roughly ${formatCurrency(impliedBudget)} in total, or ${formatPercent(impliedBudget / anchor.amount)} of the target: ${formatCurrency(shortfall)} more over the ${daysLeft} days left, or a better return on what is already being spent.`
        : `${formatPercent(target.budgetPct / 100)} of the target is ${formatCurrency(budget)}, of which ${formatCurrency(spentSoFar)} is already spent. At the ${rate} of ${goalName} per ad dollar ${source}, that finishes past the ${formatCurrency(anchor.amount)} of ${goalName} asked for — about ${formatPercent(impliedBudget / anchor.amount)} of the target reaches it, and the rest is available elsewhere.`,
  })
}

/**
 * Whether current trading reaches each aim, before any change to the spend.
 *
 * One note covering every aim rather than one per aim: a target set on revenue
 * and profit together is usually on pace for one and short on the other, and
 * that contrast is the reading — split across two notes it reads as two
 * unrelated findings.
 */
function paceNote({ aimPlans, daysLeft, basis }: AdviceInput, notes: TargetNote[]): void {
  if (daysLeft === 0) return

  const measured = aimPlans.filter((aim) => aim.paceAttainment !== null)
  if (measured.length === 0) return

  const short = measured.filter((aim) => (aim.paceAttainment as number) < 1)

  const say = (aim: AimPlan): string => {
    const name = TARGET_GOAL_LABELS[aim.goal].toLowerCase()
    const reach = isMoneyGoal(aim.goal)
      ? formatCurrency(aim.pace as number)
      : formatRoas(aim.pace as number)
    const asked = isMoneyGoal(aim.goal)
      ? formatCurrency(aim.amount)
      : formatRoas(aim.amount)
    return `${name} ${reach} against ${asked} (${formatPercent(aim.paceAttainment as number)})`
  }

  if (short.length === 0) {
    notes.push({
      tone: 'good',
      title:
        measured.length > 1 ? 'On pace for every aim' : 'On pace for the goal',
      detail: `${basis === 'window' ? "Counting what the window has already banked and carrying its own rate over the days left" : "Carrying the store's current rate across the window"}, it finishes at ${formatList(
        measured.map(say),
      )}. Nothing has to change for the target to be met.`,
    })
    return
  }

  notes.push({
    tone: short.length === measured.length ? 'bad' : 'warn',
    title:
      short.length === measured.length
        ? measured.length > 1
          ? 'Behind on every aim'
          : 'Behind on the goal'
        : `Behind on ${formatList(
            short.map((aim) => TARGET_GOAL_LABELS[aim.goal].toLowerCase()),
          )}`,
    detail: `${basis === 'window' ? "Counting what is already banked and carrying the window's own rate" : "Carrying the store's current rate"} over the ${daysLeft} days left, it finishes at ${formatList(
      short.map(say),
    )}.${
      short.length === measured.length
        ? ''
        : ` The rest of the target is in reach: ${formatList(
            measured
              .filter((aim) => (aim.paceAttainment as number) >= 1)
              .map(say),
          )}.`
    }`,
  })
}

/** Whether current spend is on the pace the budget assumes. */
function pacingNote(
  { perDay, basisIsImplied, pacingPerDay, daysLeft, basis, notStarted }: AdviceInput,
  notes: TargetNote[],
): void {
  // A window that has not opened has no pace of its own to be over or under.
  // What to spend when it does is the previous note's business.
  if (notStarted) return
  // Runs against the recommended daily figure too, not only an entered one:
  // "the goal needs £121 a day and you are spending £258" is the same useful
  // sentence whichever side of it the reader supplied.
  if (pacingPerDay === null || perDay <= 0) return

  const allows = basisIsImplied ? 'The goal needs' : 'The plan allows'
  const running =
    basis === 'window' ? 'the window has been running at' : 'the store is currently spending'
  const gap = perDay - pacingPerDay

  // Under a tenth of the daily budget is drift, not a decision to make.
  if (Math.abs(gap) < perDay * 0.1) {
    notes.push({
      tone: 'good',
      title: 'Spending on pace',
      detail: `${allows} ${formatCurrency(perDay)} a day from here, and the window has been running at ${formatCurrency(pacingPerDay)}. Nothing to change.`,
    })
    return
  }

  notes.push({
    tone: gap > 0 ? 'warn' : 'bad',
    title: gap > 0 ? 'Spending under pace' : 'Spending over pace',
    detail:
      gap > 0
        ? `${allows} ${formatCurrency(perDay)} a day from here; ${running} ${formatCurrency(pacingPerDay)}. At this rate the goal goes unmet — raise daily spend by about ${formatCurrency(gap)}.`
        : `${allows} ${formatCurrency(perDay)} a day from here; ${running} ${formatCurrency(pacingPerDay)}, which is ${formatCurrency(-gap)} a day above it. ${
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
  { woo, anchor, budget, projected }: AdviceInput,
  notes: TargetNote[],
): void {
  // Only against a top-line aim. Gross margin is a share of sales, so applying
  // it to a profit goal would ask what margin a profit earns — the goods have
  // already been paid for by the time that figure exists.
  if (!woo || !anchor || anchor.goal === 'profit' || projected === null) return

  const margin = woo.grossMargin.value
  if (margin <= 0) return

  const goalName = TARGET_GOAL_LABELS[anchor.goal].toLowerCase()

  // The goods behind the sales have to cost less than the sales bring in before
  // any of this is worth doing; the ad spend comes out of what is left.
  const grossOnGoal = anchor.amount * margin
  if (grossOnGoal > budget) return

  notes.push({
    tone: 'bad',
    title: 'The goal costs more than it earns',
    detail: `At ${formatPercent(margin)} gross margin, ${formatCurrency(anchor.amount)} of ${goalName} leaves about ${formatCurrency(grossOnGoal)} before advertising — less than the ${formatCurrency(budget)} budgeted to win it. The target is unprofitable as set, whatever the return on the ads.`,
  })
}
