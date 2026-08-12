/** All user-facing number formatting funnels through this module. */

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * Axis/tooltip currency. `en-GB` renders USD as `US$1,350`, which is the form
 * the chart ticks use.
 */
const usdAxis = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const int = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

const pct1 = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const pct2 = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const dec2 = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const compactInt = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

export const formatCurrency = (n: number): string => usd.format(n)
export const formatAxisCurrency = (n: number): string => usdAxis.format(n)
export const formatInteger = (n: number): string => int.format(n)

/** `4250` → `4.3K`. Keeps a count axis narrow enough not to crowd the plot. */
export const formatCompactInteger = (n: number): string => compactInt.format(n)
export const formatDecimal = (n: number): string => dec2.format(n)

/** `0.774` → `77.4%` */
export const formatPercent = (ratio: number): string => pct1.format(ratio)

/** CTR reads better with two places at typical ad-platform magnitudes. */
export const formatCtr = (ratio: number): string => pct2.format(ratio)

/** `37.4` → `37.4%` — for deltas, which arrive already scaled to percent. */
export const formatDeltaPercent = (pct: number): string =>
  `${pct1.format(Math.abs(pct) / 100)}`

export const formatRoas = (n: number): string => `${dec2.format(n)}x`

const list = new Intl.ListFormat('en-US', { style: 'long', type: 'conjunction' })

/**
 * `[a, b, c]` → `a, b, and c` — one item stands alone, two join with "and".
 *
 * Written prose, not a table, so a plain `join(' and ')` shows: three aims on
 * one target read "revenue and profit and return", which is how a sentence
 * announces that nobody read it back.
 */
export const formatList = (parts: string[]): string => list.format(parts)

const dateFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

const dayFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

/** `2026-07-31` → `Jul 31, 2026` */
export const formatDate = (iso: string): string =>
  dateFmt.format(parseIsoDate(iso))

/** `2026-07-31` → `Jul 31` */
export const formatDay = (iso: string): string => dayFmt.format(parseIsoDate(iso))

/**
 * Parses `yyyy-MM-dd` (or a full ISO timestamp) as UTC so calendar days never
 * shift under the viewer's local timezone.
 */
export function parseIsoDate(iso: string): Date {
  const datePart = iso.slice(0, 10)
  const [y, m, d] = datePart.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

const moneyIn = new Map<string, Intl.NumberFormat>()

/**
 * `51.25` in `EUR` → `€51.25`. For figures that are not in store currency
 * and must not be dressed as though they were.
 *
 * Falls back to the bare amount and the code where the runtime does not know
 * the currency, which beats throwing inside a table row.
 */
export function formatMoneyIn(amount: number, currency: string): string {
  if (!currency) return usd.format(amount)
  let formatter = moneyIn.get(currency)
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    } catch {
      return `${dec2.format(amount)} ${currency}`
    }
    moneyIn.set(currency, formatter)
  }
  return formatter.format(amount)
}

/**
 * A metric's comparison-window figure, formatted, or undefined where it has
 * none.
 *
 * Undefined and zero are kept apart deliberately. A source that ran with the
 * comparison off knows nothing about the previous window; a source that ran
 * with it on and found nothing knows the figure was zero. Collapsing the two
 * would print `$0.00` under half the rows on the dashboard and invite it to be
 * read as a collapse rather than as an absence.
 */
export function formatPrevious(
  m: { previous?: number | null },
  format: (n: number) => string,
): string | undefined {
  return m.previous === null || m.previous === undefined ? undefined : format(m.previous)
}

/**
 * A difference, signed and formatted in its own units.
 *
 * The percentage beside a figure says how far it moved in proportion; this says
 * how far it moved in the thing itself. On a small base the two part company —
 * `+300%` is four redemptions against one — and the pair together is what makes
 * either of them safe to act on.
 *
 * The minus is U+2212, matching the statement's own deductions rather than the
 * hyphen a keyboard produces.
 */
export function formatDifference(
  difference: number,
  format: (n: number) => string,
): string {
  if (difference === 0) return `±${format(0)}`
  return `${difference > 0 ? '+' : '−'}${format(Math.abs(difference))}`
}
