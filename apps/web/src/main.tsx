import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'

// Matches the API's own cache lifetime for derived data (DERIVED_DATA_TTL_MS
// in apps/api/src/cache/cache-ttl.ts). Refetching sooner could only return the
// same cached response.
const QUERY_STALE_TIME_MS = 5 * 60 * 1000

// React Query's defaults (staleTime 0, refetch on every window focus) re-sent
// every query on a page each time it mounted or the tab regained focus, which
// is most of this app's database traffic. Everything here changes either when
// a batch job runs or when this user acts, and every mutation already calls
// invalidateQueries, which refetches active queries regardless of staleTime.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: QUERY_STALE_TIME_MS,
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
