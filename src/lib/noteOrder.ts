import type { TargetNote } from './types'

/**
 * What needs doing, before what is merely true.
 *
 * Notes arrive in the order they were reasoned out — the model's for an
 * analysis, the plan's own checks for a target — which puts whatever was
 * looked at first on top, often a figure that is fine. Both are read to decide
 * what to change this week, so the notes naming something wrong lead, warnings
 * follow, and what is going well comes last.
 *
 * Sorted rather than filtered. A target with nothing wrong should say so
 * rather than come back empty, and the good notes are the evidence that the
 * bad ones are the exception.
 *
 * Stable within a tone — `sort` is stable in every engine this runs on — so
 * the original ordering survives among notes of equal urgency, and a rerun
 * that changes nothing reads the same way twice.
 *
 * Shared by the analysis panel and the target card so the two cannot come to
 * disagree about which end of a list the urgent things belong at.
 */
const TONE_ORDER: Record<TargetNote['tone'], number> = { bad: 0, warn: 1, good: 2 }

export const actionFirst = (notes: TargetNote[]): TargetNote[] =>
  [...notes].sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone])
