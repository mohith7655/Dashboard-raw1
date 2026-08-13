import type { AdapterResult, DateRange, MailchimpReport } from '../types'
import { callFunction, compareParams, toResult } from './client'

const SOURCE = 'Mailchimp'
const HINT =
  'Email engagement comes from the Mailchimp Marketing API. Check MAILCHIMP_API_KEY is a current key — Mailchimp → Account & billing → Extras → API keys — and that MAILCHIMP_SERVER_PREFIX matches the suffix on it, e.g. `us11` for a key ending `-us11`. Then click Retry.'

export async function fetchMailchimp(
  range: DateRange,
  against: DateRange | null,
): Promise<AdapterResult<MailchimpReport>> {
  return toResult(SOURCE, HINT, () =>
    callFunction<MailchimpReport>('mailchimp', range, compareParams(against)),
  )
}
