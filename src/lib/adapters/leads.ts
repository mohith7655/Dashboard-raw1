import type { AdapterResult, DateRange, LeadReport } from '../types'
import { callFunction, compareParams, toResult } from './client'

const SOURCE = 'Leads'
const HINT =
  'Leads come from the Google Sheet the Make.com automations write into. Check LEADS_SHEET_ID names that spreadsheet, and that either the sheet is shared to anyone with the link or the Google refresh token carries the spreadsheets.readonly scope — `npm run google:auth` mints one that does. Then click Retry.'

export async function fetchLeads(
  range: DateRange,
  against: DateRange | null,
): Promise<AdapterResult<LeadReport>> {
  return toResult(SOURCE, HINT, () =>
    callFunction<LeadReport>('leads', range, compareParams(against)),
  )
}
