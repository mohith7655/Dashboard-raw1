import type {
  AdapterResult,
  InsightsAnswer,
  InsightsReport,
  Target,
  TargetAdvice,
  TargetPlan,
} from '../types'
import { postFunction, toResult } from './client'

const SOURCE = 'OpenAI'
const HINT =
  'Check OPENAI_API_KEY, and that OPENAI_MODEL names a model your account can use. Then click Analyze again.'

export async function analyse(
  snapshot: Record<string, unknown>,
): Promise<AdapterResult<InsightsReport>> {
  return toResult(SOURCE, HINT, () =>
    postFunction<InsightsReport>('insights', snapshot),
  )
}

/**
 * One typed question about the same period, answered in prose.
 *
 * Posted to the same function as the report — it tells the two apart by the
 * `question` key — so the answer is drawn from exactly the figures on screen.
 */
export async function ask(
  snapshot: Record<string, unknown>,
  question: string,
): Promise<AdapterResult<InsightsAnswer>> {
  return toResult(SOURCE, HINT, () =>
    postFunction<InsightsAnswer>('insights', { question, snapshot }),
  )
}

/**
 * What to do about one target, written by the model.
 *
 * The plan the client has already computed travels with it, so the advice
 * explains the figures printed on the card rather than a second set derived
 * server-side that could disagree with them.
 */
export async function adviseTarget(
  target: Target,
  plan: Omit<TargetPlan, 'target' | 'notes'>,
  snapshot: Record<string, unknown>,
): Promise<AdapterResult<TargetAdvice>> {
  return toResult(SOURCE, HINT, () =>
    postFunction<TargetAdvice>('insights', { target, plan, snapshot }),
  )
}
