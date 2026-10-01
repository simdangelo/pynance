import type { QueryClient } from "@tanstack/react-query"

import { api } from "@/lib/api"
import { todayLocalISO } from "@/lib/utils"
import { rangeToDates } from "@/components/trend-range-selector"

/**
 * Data used by several pages (categories, assets, buckets and the allocation
 * snapshot): prefetched once at startup so page switches never show a
 * loading state for them.
 */
export function prefetchSharedData(queryClient: QueryClient) {
  void queryClient.prefetchQuery({ queryKey: ["categories"], queryFn: api.categories.list })
  void queryClient.prefetchQuery({ queryKey: ["assets"], queryFn: api.assets.list })
  void queryClient.prefetchQuery({ queryKey: ["buckets"], queryFn: api.buckets.list })
  void queryClient.prefetchQuery({ queryKey: ["allocation"], queryFn: api.assets.allocation })
  void queryClient.prefetchQuery({ queryKey: ["transfers"], queryFn: () => api.transfers.list() })
}

/**
 * Per-page data, prefetched when the pointer (or focus) lands on a nav link
 * so the page opens with its content already in cache.
 */
export function prefetchRouteData(queryClient: QueryClient, path: string) {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  switch (path) {
    case "/overview": {
      const { start, end } = rangeToDates("ALL")
      void queryClient.prefetchQuery({
        queryKey: ["net-worth-trend", start, end],
        queryFn: () => api.assets.netWorthTrend(start, end),
      })
      break
    }
    case "/transactions":
      void queryClient.prefetchQuery({
        queryKey: ["summary", year, month],
        queryFn: () => api.transactions.summary(year, month),
      })
      void queryClient.prefetchQuery({
        queryKey: ["transactions", { year, month, q: "", categoryId: "all" }],
        queryFn: () => api.transactions.list({ year, month }),
      })
      break
    case "/assets":
      void queryClient.prefetchQuery({ queryKey: ["assets"], queryFn: api.assets.list })
      void queryClient.prefetchQuery({ queryKey: ["buckets"], queryFn: api.buckets.list })
      void queryClient.prefetchQuery({
        queryKey: ["allocation"],
        queryFn: api.assets.allocation,
      })
      void queryClient.prefetchQuery({
        queryKey: ["transfers"],
        queryFn: () => api.transfers.list(),
      })
      break
    case "/recurring":
      void queryClient.prefetchQuery({
        queryKey: ["recurring"],
        queryFn: api.recurringTemplates.list,
      })
      break
    case "/reports": {
      const { start, end } = rangeToDates("YTD")
      void queryClient.prefetchQuery({
        queryKey: ["trend", "all"],
        queryFn: () => api.transactions.trend("2000-01-01", todayLocalISO()),
      })
      void queryClient.prefetchQuery({
        queryKey: ["trend", start, end],
        queryFn: () => api.transactions.trend(start, end),
      })
      void queryClient.prefetchQuery({
        queryKey: ["trend-by-category", start, end],
        queryFn: () => api.transactions.trendByCategory(start, end),
      })
      break
    }
    default:
      break
  }
}
