import type { AdapterResult, DateRange, LeadReport } from '../types'
import { callFunction, compareParams, toResult } from './client'

const SOURCE = 'Leads'
const HINT =
  'Meta leads are the FB lead contacts Make.com adds to Mailchimp Raww Gym Tips; Gravity Forms leads are its Learn Barehand contacts. Check MAILCHIMP_API_KEY, MAILCHIMP_SERVER_PREFIX, WOO_STORE_URL, WOO_CONSUMER_KEY, and WOO_CONSUMER_SECRET in Netlify, then click Retry.'

export async function fetchLeads(
  range: DateRange,
  against: DateRange | null,
): Promise<AdapterResult<LeadReport>> {
  return toResult(SOURCE, HINT, () =>
    callFunction<LeadReport>('leads', range, compareParams(against)),
  )
}
