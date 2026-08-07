import { useState } from 'react'
import { MousePointerClick, Eye, Percent, ArrowUpNarrowWide } from 'lucide-react'
import type { GscDimension, GscReport, GscRow, Metric } from '../../lib/types'
import { GSC_DIMENSIONS, GSC_DIMENSION_LABELS } from '../../lib/types'
import { deltaPct } from '../../lib/derive'
import {
  formatCtr,
  formatDecimal,
  formatInteger,
} from '../../lib/format'
import { DataTable, paginateRows, type Column } from '../DataTable'
import { KpiCard } from '../KpiCard'
import { CardRow } from '../CardRow'

interface SearchConsoleCardProps {
  report: GscReport | undefined
  dimension: GscDimension
  onDimensionChange: (dimension: GscDimension) => void
  loading: boolean
  fetching: boolean
  error: string | null
}

const PER_PAGE = 10

/**
 * Organic search: the headline four, then the same period cut by whichever
 * dimension is selected.
 *
 * Average position is the one figure on the dashboard where **down is good** —
 * position 3 outranks position 8 — so it carries the inverted polarity rather
 * than colouring a climb up the results page red.
 */
export function SearchConsoleCard({
  report,
  dimension,
  onDimensionChange,
  loading,
  fetching,
  error,
}: SearchConsoleCardProps) {
  const [page, setPage] = useState(1)

  const rows = report?.rows ?? []
  const pageCount = Math.max(1, Math.ceil(rows.length / PER_PAGE))
  const safePage = Math.min(page, pageCount)

  const totals = report?.totals
  const was = report?.previousTotals ?? null

  // Absent rather than zero when there is no comparison window: a delta of 0%
  // and no baseline at all are different statements.
  const metric = (
    read: (m: NonNullable<typeof totals>) => number,
  ): Metric | undefined =>
    totals
      ? { value: read(totals), deltaPct: was ? deltaPct(read(totals), read(was)) : null }
      : undefined

  const columns: Column<GscRow>[] = [
    {
      key: 'key',
      header: GSC_DIMENSION_LABELS[dimension],
      width: 'min-w-[240px]',
      skeletonWidth: 'w-48',
      render: (row) => (
        // Queries and URLs both run long; the cell truncates rather than
        // pushing the figures off the card.
        <span className="block max-w-[320px] truncate text-ink" title={row.key}>
          {row.key}
        </span>
      ),
    },
    numeric('clicks', 'Clicks', (r) => formatInteger(r.clicks), 'text-ink'),
    numeric('impressions', 'Impressions', (r) => formatInteger(r.impressions)),
    numeric('ctr', 'CTR', (r) => formatCtr(r.ctr)),
    numeric('position', 'Avg. position', (r) => formatDecimal(r.position)),
  ]

  return (
    <div className="flex flex-col gap-4">
      <CardRow>
        <KpiCard
          label="Organic Clicks"
          value={totals ? formatInteger(totals.clicks) : '—'}
          metric={metric((t) => t.clicks)}
          icon={MousePointerClick}
          loading={loading}
          unavailable={!!error}
        />
        <KpiCard
          label="Impressions"
          value={totals ? formatInteger(totals.impressions) : '—'}
          metric={metric((t) => t.impressions)}
          icon={Eye}
          loading={loading}
          unavailable={!!error}
        />
        <KpiCard
          label="CTR"
          value={totals ? formatCtr(totals.ctr) : '—'}
          metric={metric((t) => t.ctr)}
          icon={Percent}
          loading={loading}
          unavailable={!!error}
        />
        <KpiCard
          label="Avg. Position"
          value={totals ? formatDecimal(totals.position) : '—'}
          metric={metric((t) => t.position)}
          // Rank 3 beats rank 8: a fall in this number is a rise up the page.
          polarity="down-good"
          icon={ArrowUpNarrowWide}
          loading={loading}
          unavailable={!!error}
        />
      </CardRow>

      <div role="tablist" aria-label="Search Console breakdown" className="flex flex-wrap gap-1.5">
        {GSC_DIMENSIONS.map((id) => {
          const selected = id === dimension
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => {
                onDimensionChange(id)
                setPage(1)
              }}
              className={`h-8 rounded-lg border px-3 text-[12px] transition-colors ${
                selected
                  ? 'border-btn-border bg-btn text-ink'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {GSC_DIMENSION_LABELS[id]}
            </button>
          )
        })}
      </div>

      <DataTable
        title={`Organic search by ${GSC_DIMENSION_LABELS[dimension].toLowerCase()}`}
        subtitle={
          report
            ? `${report.siteUrl} — clicks, impressions, click-through rate and average rank, straight from Search Console.`
            : 'Clicks, impressions, click-through rate and average rank for every value of the selected breakdown.'
        }
        columns={columns}
        rows={paginateRows(rows, safePage, PER_PAGE)}
        rowKey={(row) => row.key}
        total={rows.length}
        page={safePage}
        perPage={PER_PAGE}
        onPageChange={setPage}
        loading={loading}
        fetching={fetching}
        noun="rows"
        unavailable={error ?? undefined}
      />
    </div>
  )
}

function numeric(
  key: string,
  header: string,
  render: (row: GscRow) => string,
  tone = 'text-muted',
): Column<GscRow> {
  return {
    key,
    header,
    align: 'right',
    skeletonWidth: 'w-12',
    render: (row) => <span className={`tabular-nums ${tone}`}>{render(row)}</span>,
  }
}
