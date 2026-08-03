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
