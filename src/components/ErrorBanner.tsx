import { AlertCircle, RefreshCw, X } from 'lucide-react'
import type { SourceError } from '../lib/types'

interface ErrorBannerProps {
  error: SourceError
  onRetry: () => void
  onDismiss: () => void
  retrying?: boolean
}

/**
 * One banner per failed connector. The upstream message is rendered verbatim —
 * operators need the raw text (error codes, token expiry times) to act on it.
 */
export function ErrorBanner({ error, onRetry, onDismiss, retrying }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-[10px] border border-[rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.06)] px-4 py-3"
    >
      <AlertCircle size={16} className="mt-0.5 shrink-0 text-neg" />

      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-neg">
          {error.source}: {error.message}
        </p>
        {error.hint && <p className="mt-1 text-[12px] text-muted">{error.hint}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="flex items-center gap-1.5 rounded-lg border border-btn-border bg-btn px-3 py-1.5 text-[12px] text-ink transition-colors hover:border-[#3a3a40] disabled:opacity-50"
        >
          <RefreshCw size={12} className={retrying ? 'animate-spin' : undefined} />
          Retry
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={`Dismiss ${error.source} error`}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:text-ink"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
