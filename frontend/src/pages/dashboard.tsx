import { useMemo, useState } from "react"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { api } from "@/lib/api"
import { formatCompact, monthLabel } from "@/lib/chart"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { DashboardHero, type LiquidityEntry } from "@/components/dashboard-hero"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import {
  TrendRangeSelector,
  rangeToDates,
  type TrendRange,
} from "@/components/trend-range-selector"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

const NET_WORTH_CONFIG = {
  amount: { label: "Net worth", color: "var(--primary)" },
} satisfies ChartConfig

function greeting(date = new Date()): string {
  const hour = date.getHours()
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

export default function Dashboard() {
  const queryClient = useQueryClient()
  const [range, setRange] = useState<TrendRange>("ALL")
  const [demoConfirmOpen, setDemoConfirmOpen] = useState(false)

  const { data: appConfig } = useQuery({
    queryKey: ["config"],
    queryFn: api.config,
  })

  const demoMutation = useMutation({
    mutationFn: api.demoData.generate,
    onSuccess: (result) => {
      queryClient.invalidateQueries()
      toast.success(`Generated ${result.transactions_created} transactions`)
    },
    onError: (error: Error) => toast.error(error.message || "Failed to generate demo data"),
  })

  const {
    data: allocation,
    isLoading: allocationLoading,
    isError: allocationError,
  } = useQuery({
    queryKey: ["allocation"],
    queryFn: api.assets.allocation,
  })

  const { start, end } = useMemo(() => rangeToDates(range), [range])

  const {
    data: trend,
    isLoading: trendLoading,
    isError: trendError,
    isPlaceholderData: trendIsPlaceholder,
  } = useQuery({
    queryKey: ["net-worth-trend", start, end],
    queryFn: () => api.assets.netWorthTrend(start, end),
    placeholderData: keepPreviousData,
  })

  const liquidity = useMemo<LiquidityEntry[]>(
    () =>
      (allocation?.by_liquidity ?? []).map((row) => ({
        category: row.liquidity_category,
        total: Number(row.total).toFixed(2),
      })),
    [allocation],
  )

  const trendData = useMemo(
    () =>
      (trend ?? []).map((point) => ({
        month: `${point.year}-${String(point.month).padStart(2, "0")}`,
        amount: Number(point.amount),
      })),
    [trend],
  )

  const delta = useMemo(() => {
    if (trendIsPlaceholder) return null
    if (trendData.length < 2) return null
    const first = trendData[0].amount
    if (!first) return null
    return {
      pct:
        ((trendData[trendData.length - 1].amount - first) / Math.abs(first)) * 100,
      sinceLabel: monthLabel(trendData[0].month),
      range,
    }
  }, [trendData, range, trendIsPlaceholder])

  return (
    <div className="space-y-5">
      <PageHeader
        title={greeting()}
        action={
          appConfig?.demo_data_enabled ? (
            <Button variant="outline" onClick={() => setDemoConfirmOpen(true)}>
              <Sparkles className="mr-1 h-4 w-4" /> Generate fake data
            </Button>
          ) : undefined
        }
      />

      <DashboardHero
        delta={delta}
        liquidity={liquidity}
        loading={allocationLoading}
        error={allocationError}
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Net worth trend</CardTitle>
            <TrendRangeSelector value={range} onChange={setRange} />
          </div>
        </CardHeader>
        <CardContent>
          {trendLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : trendError ? (
            <p className="py-8 text-center text-sm text-destructive">
              Failed to load net worth.
            </p>
          ) : trendData.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No net worth history in this range.
            </p>
          ) : (
            <ChartContainer config={NET_WORTH_CONFIG} className="h-[380px] w-full">
              <AreaChart
                accessibilityLayer
                data={trendData}
                margin={{ left: 12, right: 12 }}
              >
                <defs>
                  <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor="var(--color-amount)"
                      stopOpacity={0.18}
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--color-amount)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  vertical={false}
                  stroke="var(--color-chart-grid)"
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={32}
                  interval="preserveStartEnd"
                  tick={{ className: "font-numeric" }}
                  tickFormatter={monthLabel}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tick={{ className: "font-numeric" }}
                  tickFormatter={formatCompact}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(value) => monthLabel(String(value))}
                    />
                  }
                />
                <Area
                  dataKey="amount"
                  type="linear"
                  stroke="var(--color-amount)"
                  strokeWidth={2.5}
                  fill="url(#netWorthFill)"
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={demoConfirmOpen}
        onOpenChange={setDemoConfirmOpen}
        title="Generate fake data?"
        description="Your current transactions, transfers and adjustments will be replaced with about 10 years of fake data. Development-only tool."
        confirmLabel="Generate"
        onConfirm={() => demoMutation.mutate()}
      />

      {demoMutation.isPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4 shadow-lg">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
            <span className="text-sm font-medium">Generating fake data…</span>
          </div>
        </div>
      )}
    </div>
  )
}
