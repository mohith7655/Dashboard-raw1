import type { AdapterResult, DateRange, LeadReport } from '../types'
import { callFunction, compareParams, toResult } from './client'

const SOURCE = 'Leads'
const HINT =
  'Meta leads come from Meta instant-form submissions; Gravity Forms leads come from the Learn Barehand form contacts in Mailchimp Raww Gym Tips and Flodesk. Check META_ACCESS_TOKEN, MAILCHIMP_API_KEY, MAILCHIMP_SERVER_PREFIX, FLODESK_API_KEY, and METORIK_API_KEY in Netlify, then click Retry.'

export async function fetchLeads(
  range: DateRange,
  against: DateRange | null,
): Promise<AdapterResult<LeadReport>> {
  return toResult(SOURCE, HINT, () =>
    callFunction<LeadReport>('leads', range, compareParams(against)),
  )
}
