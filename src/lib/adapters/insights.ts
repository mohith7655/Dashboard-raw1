import type { AdapterResult, InsightsAnswer, InsightsReport } from '../types'
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
