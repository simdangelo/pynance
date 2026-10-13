import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import { ALL_TIME_START, todayISO } from "@/lib/period"

export function useAllTimeTrend(excludeCategoryIds: number[] = []) {
  return useQuery({
    queryKey: ["trend", "all", excludeCategoryIds],
    queryFn: () => api.transactions.trend(ALL_TIME_START, todayISO(), excludeCategoryIds),
    staleTime: 60_000,
  })
}
