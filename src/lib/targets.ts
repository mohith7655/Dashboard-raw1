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

export function planTarget({
  target,
  progress,
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
  const windowDays = Math.max(1, daysUntil(target.start, target.deadline))
  const notStarted = before(today, target.start)
  const daysLeft = notStarted ? windowDays : daysUntil(today, target.deadline)
  const daysElapsed = Math.max(0, windowDays - daysLeft)

  // Everything below is struck from the window's own trading. The range in the
  // picker decides what the cards above show; it has no business deciding what
  // a target that names its own dates is measured over.
  const spentSoFar = progress?.spend ?? 0
  const pacingPerDay =
    progress && progress.days > 0 ? progress.spend / progress.days : null

  // The window's own return per ad pound, not a platform's claim about itself
  // and not the picker's period. Unknown rather than zero below a token spend:
  // dividing revenue by nothing produces a number that says more about the
  // divisor than the campaigns.
  const roas =
    progress && progress.spend >= MIN_MEANINGFUL_SPEND ? progress.roas : null

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
    : progress && progress.days > 0
      ? (progress.revenue / progress.days) * windowDays
      : 0

  const budget = (salesBasis * target.budgetPct) / 100

  // A money aim divides into the budget it needs; a return aim is already a
  // rate and implies no budget of its own.
  //
  // Struck against what is still to earn rather than the whole goal, and added
  // to what has already gone out: the money already spent bought the sales
  // already banked, and charging the store for those a second time is exactly
  // the error this plan used to make.
  const stillToEarn = anchor ? Math.max(0, anchor.amount - (achievedFor(anchor.goal, progress) ?? 0)) : 0
  const impliedBudget =
    anchor && roas && roas > 0 ? spentSoFar + stillToEarn / roas : null
  const projected =
    anchor && roas ? (achievedFor(anchor.goal, progress) ?? 0) + Math.max(0, budget - spentSoFar) * roas : null

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
        runRate: achieved,
        pace: achieved,
        paceAttainment:
          achieved === null || aim.amount <= 0 ? null : achieved / aim.amount,
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
    const runRate =
      progress && progress.days > 0 && achieved !== null
        ? achieved / progress.days
        : null
    // Where it finishes if trading holds: banked plus the run rate over what
    // is left. The old figure projected the run rate alone and so reported a
    // half-finished target as though nothing had been earned yet.
    const pace =
      runRate === null || achieved === null ? null : achieved + runRate * daysLeft

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

/** `achievedOn` through a progress that may not have arrived yet. */
const achievedFor = (
  goal: TargetGoal,
  progress: TargetProgress | null,
): number | null => (progress ? achievedOn(goal, progress) : null)

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
 * That the window has not opened yet, where it has not.
 *
 * Said first because it changes how every figure under it should be read: the
 * rates divide by the whole window rather than by a countdown, and the store's
 * own run rate beside them is what it is trading at now, which is before the
 * target is meant to be worked on at all.
 */
function windowNote(
  { target, notStarted, windowDays }: AdviceInput,
  notes: TargetNote[],
): void {
  if (!notStarted) return

  notes.push({
    tone: 'warn',
    title: 'The window has not opened yet',
    detail: `${target.name} runs from ${target.start} to ${target.deadline}, ${windowDays} days. The rates below are struck across that whole window, and the trading they are set against is the period on screen — which is before it.`,
  })
}

/** Whether the budget as set reaches the goal at the return being achieved. */
function budgetNote(
  {
    target,
    anchor,
    roasAim,
    roas,
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

  if (!anchor || impliedBudget === null || projected === null) return

  const goalName = TARGET_GOAL_LABELS[anchor.goal].toLowerCase()

  // No budget entered at all. Nothing has been decided yet, so this states the
  // cost rather than reporting a shortfall against a figure nobody set.
  if (budget <= 0) {
    notes.push({
      tone: 'warn',
      title: 'No budget set yet',
      detail: `At the ${formatRoas(roas)} the window is returning, ${formatCurrency(anchor.amount)} of ${goalName} needs roughly ${formatCurrency(impliedBudget)} of ad spend in total — ${formatPercent(impliedBudget / anchor.amount)} of the target, of which ${formatCurrency(spentSoFar)} has already gone out. The daily and weekly figures above spread what is left over the ${daysLeft} days remaining; set a budget percentage to plan against your own number instead.`,
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
      detail: `At the ${formatRoas(roas)} the window is returning, ${formatPercent(target.budgetPct / 100)} of the target — ${formatCurrency(budget)}, of which ${formatCurrency(spentSoFar)} is spent — finishes at about ${formatCurrency(projected)}, near enough the ${formatCurrency(anchor.amount)} of ${goalName} asked for.`,
    })
    return
  }

  notes.push({
    tone: shortfall > 0 ? 'bad' : 'good',
    title: shortfall > 0 ? 'Increase the budget' : 'Budget is more than the goal needs',
    detail:
      shortfall > 0
        ? `${formatPercent(target.budgetPct / 100)} of the target is ${formatCurrency(budget)}, of which ${formatCurrency(spentSoFar)} is already spent. At the ${formatRoas(roas)} the window is returning, that finishes at about ${formatCurrency(projected)} — short of the ${formatCurrency(anchor.amount)} of ${goalName} asked for. Reaching it needs roughly ${formatCurrency(impliedBudget)} in total, or ${formatPercent(impliedBudget / anchor.amount)} of the target: ${formatCurrency(shortfall)} more over the ${daysLeft} days left, or a better return on what is already being spent.`
        : `${formatPercent(target.budgetPct / 100)} of the target is ${formatCurrency(budget)}, of which ${formatCurrency(spentSoFar)} is already spent. At the ${formatRoas(roas)} the window is returning, that finishes past the ${formatCurrency(anchor.amount)} of ${goalName} asked for — about ${formatPercent(impliedBudget / anchor.amount)} of the target reaches it, and the rest is available elsewhere.`,
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
function paceNote({ aimPlans, daysLeft }: AdviceInput, notes: TargetNote[]): void {
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
      detail: `Counting what the window has already banked and carrying its own rate over the days left, it finishes at ${formatList(
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
    detail: `Counting what is already banked and carrying the window's own rate over the ${daysLeft} days left, it finishes at ${formatList(
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
      detail: `${allows} ${formatCurrency(perDay)} a day from here, and the window has been running at ${formatCurrency(pacingPerDay)}. Nothing to change.`,
    })
    return
  }

  notes.push({
    tone: gap > 0 ? 'warn' : 'bad',
    title: gap > 0 ? 'Spending under pace' : 'Spending over pace',
    detail:
      gap > 0
        ? `${allows} ${formatCurrency(perDay)} a day from here; the window has been running at ${formatCurrency(pacingPerDay)}. At this rate the goal goes unmet — raise daily spend by about ${formatCurrency(gap)}.`
        : `${allows} ${formatCurrency(perDay)} a day from here; the window has been running at ${formatCurrency(pacingPerDay)}, which is ${formatCurrency(-gap)} a day above it. ${
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
