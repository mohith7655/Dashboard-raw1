import type { AdapterResult, InsightsReport } from '../types'
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
