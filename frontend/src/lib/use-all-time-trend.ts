import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import { ALL_TIME_START, todayISO } from "@/lib/period"

export function useAllTimeTrend() {
  return useQuery({
    queryKey: ["trend", "all"],
    queryFn: () => api.transactions.trend(ALL_TIME_START, todayISO()),
    staleTime: 60_000,
  })
}
