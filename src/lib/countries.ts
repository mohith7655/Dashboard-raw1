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
 * Names GA4 uses that `Intl.DisplayNames` spells differently, plus the ones
 * people type by hand. Everything else resolves off the generated table below,
 * so this list only has to carry the disagreements.
 */
const ALIASES: Record<string, string> = {
  'hong kong': 'HK',
  macao: 'MO',
  macau: 'MO',
  palestine: 'PS',
  myanmar: 'MM',
  burma: 'MM',
  'czech republic': 'CZ',
  'ivory coast': 'CI',
  'cape verde': 'CV',
  'east timor': 'TL',
  swaziland: 'SZ',
  macedonia: 'MK',
  'united states of america': 'US',
  usa: 'US',
  uk: 'GB',
  'great britain': 'GB',
  'south korea': 'KR',
  'north korea': 'KP',
  'vatican city': 'VA',
  'democratic republic of the congo': 'CD',
  'republic of the congo': 'CG',
}

/** Case, accents, punctuation and a leading "the" all removed. */
const normalise = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

let codesByName: Map<string, string> | null = null

/**
 * `India` → `IN`, the inverse of {@link countryName}.
 *
 * Needed because the two halves of this dashboard name countries differently:
 * orders carry ISO codes, GA4 reports display names. Built by running the whole
 * code table back through `Intl.DisplayNames` rather than shipping a name list,
 * so it stays in step with whatever the runtime calls each place.
 *
 * Returns an empty string for anything unrecognised — `(not set)` above all,
 * which GA4 uses for traffic it could not place and which is not a country.
 */
export function countryCode(name: string): string {
  const key = normalise(name)
  if (!key || key === 'not set' || key === 'unknown') return ''
  // Already a code: GA4 occasionally reports one, and the caller may be
  // passing store data through the same door.
  if (/^[A-Z]{2}$/.test(name.trim()) && COUNTRY_CODES.includes(name.trim())) {
    return name.trim()
  }

  if (!codesByName) {
    codesByName = new Map()
    for (const code of COUNTRY_CODES) {
      const resolved = normalise(countryName(code))
      // First spelling wins, so an alias below can still override a collision.
      if (resolved && !codesByName.has(resolved)) codesByName.set(resolved, code)
    }
  }

  return ALIASES[key] ?? codesByName.get(key) ?? ''
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
