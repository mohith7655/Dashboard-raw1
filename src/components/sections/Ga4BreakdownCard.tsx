import { useState } from 'react'
import type { Ga4Dimension, Ga4Report, Ga4Row } from '../../lib/types'
import { GA4_DIMENSIONS, GA4_DIMENSION_LABELS } from '../../lib/types'
import {
  formatCompactInteger,
  formatCurrency,
  formatInteger,
  formatPercent,
} from '../../lib/format'
import { DataTable, paginateRows, type Column } from '../DataTable'

interface Ga4BreakdownCardProps {
  report: Ga4Report | undefined
  dimension: Ga4Dimension
  onDimensionChange: (dimension: Ga4Dimension) => void
  loading: boolean
  fetching: boolean
  error: string | null
}

const PER_PAGE = 10

/** `152` → `2m 32s`. GA4 reports session duration in seconds. */
function formatDuration(seconds: number): string {
  if (seconds <= 0) return '—'
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
}

/**
 * Every GA4 breakdown shares one shape, so one table serves all of them and
 * the dimension is just a filter above it. Switching breakdown re-queries;
 * paging and the row cap stay on the server side of that boundary.
 */
export function Ga4BreakdownCard({
  report,
  dimension,
  onDimensionChange,
  loading,
  fetching,
  error,
}: Ga4BreakdownCardProps) {
  const [page, setPage] = useState(1)

  const rows = report?.rows ?? []
  const pageCount = Math.max(1, Math.ceil(rows.length / PER_PAGE))
  const safePage = Math.min(page, pageCount)

  const columns: Column<Ga4Row>[] = [
    {
      key: 'key',
      header: GA4_DIMENSION_LABELS[dimension],
      width: 'min-w-[220px]',
      skeletonWidth: 'w-44',
      render: (row) => (
        // Landing pages and paths can be long; the cell truncates rather than
        // pushing the metric columns off the card.
        <span className="block max-w-[280px] truncate text-ink" title={row.key}>
          {row.key}
        </span>
      ),
    },
    numeric('users', 'Users', (r) => formatInteger(r.users), 'text-ink'),
    numeric('sessions', 'Sessions', (r) => formatInteger(r.sessions)),
    numeric('pageViews', 'Views', (r) => formatInteger(r.pageViews)),
    numeric('engagementRate', 'Engaged', (r) => formatPercent(r.engagementRate)),
    numeric('avgSessionDuration', 'Avg. time', (r) =>
      formatDuration(r.avgSessionDuration),
    ),
    numeric('purchases', 'Purchases', (r) => formatInteger(r.purchases)),
    numeric('conversionRate', 'Conv. rate', (r) => formatPercent(r.conversionRate)),
    numeric('revenue', 'Revenue', (r) => formatCurrency(r.revenue), 'text-ink'),
  ]

  const totals = report?.totals
  const subtitle = totals
    ? `${formatCompactInteger(totals.users)} users · ${formatCompactInteger(
        totals.sessions,
      )} sessions · ${formatPercent(totals.conversionRate)} conversion · ${formatCurrency(
        totals.revenue,
      )} revenue, straight from GA4`
    : 'Users, engagement and revenue for every value of the selected breakdown.'

  return (
    <div className="flex flex-col gap-3">
      <div
        role="tablist"
        aria-label="GA4 breakdown"
        className="flex flex-wrap gap-1.5"
      >
        {GA4_DIMENSIONS.map((id) => {
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
              {GA4_DIMENSION_LABELS[id]}
            </button>
          )
        })}
      </div>

      <DataTable
        title={`GA4 by ${GA4_DIMENSION_LABELS[dimension].toLowerCase()}`}
        subtitle={subtitle}
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

      {report && report.unsupported.length > 0 && (
        <p className="text-[12px] text-muted">
          This property does not report {report.unsupported.join(', ')}, so those
          columns read zero.
        </p>
      )}
    </div>
  )
}

function numeric(
  key: string,
  header: string,
  render: (row: Ga4Row) => string,
  tone = 'text-muted',
): Column<Ga4Row> {
  return {
    key,
    header,
    align: 'right',
    skeletonWidth: 'w-12',
    render: (row) => <span className={`tabular-nums ${tone}`}>{render(row)}</span>,
  }
}
