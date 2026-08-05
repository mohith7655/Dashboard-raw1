/**
 * Every ISO 3166-1 alpha-2 country, for pickers that must offer somewhere the
 * store has not shipped to yet.
 *
 * Held as codes only. Names come from `Intl.DisplayNames`, which the browser
 * already carries in the viewer's own language, so a 250-row name table never
 * has to be shipped or kept up to date here.
 */
const CODES =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ ' +
  'BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR ' +
  'CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
  'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ' +
  'ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ ' +
  'LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ ' +
  'MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF ' +
  'PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI ' +
  'SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR ' +
  'TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'

export const COUNTRY_CODES: string[] = CODES.split(' ')

let display: Intl.DisplayNames | null = null

/** `AU` → `Australia`, falling back to the code where the runtime has no name. */
export function countryName(code: string): string {
  if (!code) return ''
  // The order aggregate labels orders with no country this way; it is not a
  // code and must not be run through a region lookup.
  if (code === '(unknown)') return 'Unknown'
  if (!display) {
    try {
      display = new Intl.DisplayNames(['en'], { type: 'region' })
    } catch {
      return code
    }
  }
  try {
    return display.of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

/** `AU — Australia`, for a select where the code is what gets stored. */
export const countryLabel = (code: string): string => {
  const name = countryName(code)
  return name && name !== code ? `${code} — ${name}` : code
}

/**
 * Every country, by name, with any the store has actually shipped to hoisted
 * to the front — a list of 250 is unusable if the seven that matter are spread
 * through it.
 */
export function countryOptions(seen: string[]): { code: string; label: string }[] {
  const known = new Set(COUNTRY_CODES)
  const used = [...new Set(seen)].filter((code) => code && code !== '(unknown)')
  const rest = COUNTRY_CODES.filter((code) => !used.includes(code))

  const byName = (a: string, b: string) => countryName(a).localeCompare(countryName(b))

  return [
    // A destination the list does not know still belongs at the top: it is in
    // the order data, so it is somewhere the store has really shipped.
    ...used.filter((code) => known.has(code)).sort(byName),
    ...used.filter((code) => !known.has(code)).sort(),
    ...rest.sort(byName),
  ].map((code) => ({ code, label: countryLabel(code) }))
}
