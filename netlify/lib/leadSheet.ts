/**
 * Gravity Forms entries from the Make.com log sheet's "Mailchimp-Entries"
 * tab: one row per entry sent to Mailchimp, with the moment it was captured.
 *
 * Mailchimp cannot date these itself. Opt-in is when a contact first joined,
 * so someone already subscribed who fills the form again goes uncounted; and
 * ENTRYDATE is overwritten with the order date by the WooCommerce sync, which
 * turns purchases into leads. The sheet logs each entry as it happens.
 */

const SHEET_ID = process.env.LEADS_SHEET_ID?.trim() || '1F91xtnwgpP9FcxGaTyFJxUBnAJ2SY9uJ3NhX1I23zA4'
const TAB = 'Mailchimp-Entries'
const CACHE_MS = 2 * 60_000
const REQUEST_TIMEOUT_MS = 15_000
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T/

export interface SheetEntry {
  email: string
  /** The entry's day in UTC, as the sheet's own Date column gives it. */
  day: string
}

let cached: { expiresAt: number; value: SheetEntry[] } | null = null

/** Every logged entry, oldest first. */
export async function fetchSheetEntries(): Promise<SheetEntry[]> {
  if (cached && cached.expiresAt > Date.now()) return cached.value

  // The visualisation endpoint rather than `/export`, because it takes a tab
  // name where `/export` takes only a numeric gid.
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(SHEET_ID)}` +
    `/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(TAB)}`
  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  const text = await response.text()
  // A sheet that is not public answers with the sign-in page under a 200.
  if (!response.ok || text.trimStart().startsWith('<')) {
    throw new Error(`The lead entries sheet could not be read (HTTP ${response.status}); it must be shared to anyone with the link.`)
  }

  const [header = [], ...rows] = parseCsv(text)
  const emailColumn = header.findIndex((name) => /e-?mail/i.test(name))
  // Two date columns: the ISO timestamp and a formatted copy. The first data
  // row tells which is which.
  const timeColumn = rows[0]?.findIndex((cell) => TIMESTAMP.test(cell.trim())) ?? -1
  if (emailColumn < 0 || timeColumn < 0) {
    throw new Error(`The "${TAB}" tab no longer has an email and an entry timestamp column.`)
  }

  const value = rows.flatMap((row): SheetEntry[] => {
    const email = (row[emailColumn] ?? '').trim().toLowerCase()
    const at = Date.parse((row[timeColumn] ?? '').trim())
    return email && Number.isFinite(at) ? [{ email, day: new Date(at).toISOString().slice(0, 10) }] : []
  })
  cached = { value, expiresAt: Date.now() + CACHE_MS }
  return value
}

/** CSV as Sheets writes it: quoted fields, doubled quotes inside them, and newlines inside quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      // `\r\n` is one break, not two.
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if (field || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}
