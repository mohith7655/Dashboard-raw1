import { useState } from 'react'
import type { SourceError } from '../lib/types'
import { ErrorBanner } from './ErrorBanner'

interface SourceBannerProps {
  error: SourceError | null
  onRetry: () => void
  retrying?: boolean
}

/**
 * Page-level wrapper around ErrorBanner that owns its own dismiss state, so
 * every page gets consistent behaviour without repeating it.
 */
export function SourceBanner({ error, onRetry, retrying }: SourceBannerProps) {
  const [dismissed, setDismissed] = useState<string | null>(null)

  if (!error || dismissed === error.message) return null

  return (
    <div className="mb-5">
      <ErrorBanner
        error={error}
        onRetry={onRetry}
        onDismiss={() => setDismissed(error.message)}
        retrying={retrying}
      />
    </div>
  )
}
