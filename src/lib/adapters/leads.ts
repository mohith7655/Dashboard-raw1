import type { AdapterResult, DateRange, LeadReport } from '../types'
import { callFunction, compareParams, toResult } from './client'

const SOURCE = 'Leads'
const HINT =
  'Meta leads come from Meta instant-form submissions; Gravity Forms leads come from Mailchimp Form/GFORMS_SITE tags. Check META_ACCESS_TOKEN, MAILCHIMP_API_KEY, MAILCHIMP_SERVER_PREFIX, and METORIK_API_KEY in Netlify, then click Retry.'

export async function fetchLeads(
  range: DateRange,
  against: DateRange | null,
): Promise<AdapterResult<LeadReport>> {
  return toResult(SOURCE, HINT, () =>
    callFunction<LeadReport>('leads', range, compareParams(against)),
  )
}
