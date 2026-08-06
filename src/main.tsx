import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { setStoreTimeZone } from './lib/timeZone.ts'

// Before anything renders: the date picker decides its bounds on first paint,
// and a zone arriving after that would move the last selectable day under the
// reader. Substituted at build time from the deployment's own environment —
// empty, and every date stays on UTC as it was.
setStoreTimeZone(__STORE_TIME_ZONE__)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Per-source retry: a failing connector retries on its own without
      // disturbing the sections that loaded fine.
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
