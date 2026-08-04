import { Star } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { SourceBanner } from '../components/SourceBanner'
import { Skeleton } from '../components/Skeleton'
import { Pill, PILL_COLORS } from '../components/Pill'
import { RevenueOverTime } from '../components/charts/RevenueOverTime'
import { useRange } from '../lib/rangeContext'
import { useReports } from '../lib/resourceQueries'
import { useWooMetrics } from '../lib/queries'
import { formatDate } from '../lib/format'
import { formatRangeLabel } from '../lib/dateRange'
import type { ReportType } from '../lib/data/types'

const TYPE_COLOR: Record<ReportType, string> = {
  revenue: PILL_COLORS.green,
  products: PILL_COLORS.blue,
  customers: PILL_COLORS.violet,
  coupons: PILL_COLORS.amber,
  traffic: PILL_COLORS.pink,
}

export function ReportsPage() {
  const { range, against } = useRange()
  const reports = useReports(range)
  const woo = useWooMetrics(range, against)

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle={`Saved reports across ${formatRangeLabel(range)}`}
      />

      <SourceBanner
        error={reports.error}
        onRetry={reports.refetch}
        retrying={reports.isFetching}
      />

      <div className="flex flex-col gap-6">
        <RevenueOverTime
          data={woo.data?.revenueSeries ?? []}
          loading={woo.isLoading}
          unavailable={woo.error ? 'Revenue data unavailable' : undefined}
        />

        <div>
          <h3 className="mb-3 text-[15px] font-semibold text-ink">Saved reports</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {reports.isLoading
              ? Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="card">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="mt-3 h-3 w-full" />
                    <Skeleton className="mt-4 h-3 w-24" />
                  </div>
                ))
              : (reports.data ?? []).map((report) => (
                  <button
                    key={report.id}
                    type="button"
                    className="card text-left transition-colors hover:border-[#3a3a40]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-[14px] font-medium text-ink">{report.name}</h4>
                      {report.favorite && (
                        <Star size={14} className="shrink-0 fill-[#eab308] text-[#eab308]" />
                      )}
                    </div>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                      {report.description}
                    </p>
                    <div className="mt-3.5 flex items-center justify-between gap-2">
                      <Pill color={TYPE_COLOR[report.type]}>{report.type}</Pill>
                      <span className="text-[11px] text-muted">
                        Run {formatDate(report.lastRun)} · {report.owner}
                      </span>
                    </div>
                  </button>
                ))}
          </div>
        </div>
      </div>
    </>
  )
}
