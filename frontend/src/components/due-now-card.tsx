import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Play } from "lucide-react"

import { api, ApiError } from "@/lib/api"
import type { Category, RecurringTemplate } from "@/types/api"
import { Money } from "@/components/money"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { frequencyLabel } from "@/components/frequency-label"

export function DueNowCard({
  templates,
  categories,
  isLoading,
  isError,
}: {
  templates: RecurringTemplate[]
  categories?: Category[]
  isLoading?: boolean
  isError?: boolean
}) {
  const queryClient = useQueryClient()

  const dueTemplates = templates.filter((t) => t.active && t.due)

  const generateMutation = useMutation({
    mutationFn: api.recurringTemplates.generate,
    onSuccess: (transaction) => {
      queryClient.invalidateQueries()
      toast.success(
        `Generated "${transaction.description}" for ${transaction.occurred_on}`,
      )
    },
    onError: (error: Error) => {
      const message =
        error instanceof ApiError && error.status === 409
          ? "Template is paused"
          : "Failed to generate transaction"
      toast.error(message)
    },
  })

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Due now</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </CardContent>
      </Card>
    )
  }

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Due now</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">Failed to load templates.</p>
        </CardContent>
      </Card>
    )
  }

  if (dueTemplates.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Due now</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Nothing due — templates up to date.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Due now</CardTitle>
        <Badge variant="secondary" className="bg-amber-50 text-amber-700">
          {dueTemplates.length} due
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          {dueTemplates.map((template) => (
            <div
              key={template.id}
              className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/50 px-4 py-3"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-amber-900">
                  {template.description}
                </span>
                <span className="text-xs text-amber-700">
                  {frequencyLabel(template.frequency, template.interval)} · was
                  due {template.next_occurrence}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Money
                  value={
                    categories?.find((c) => c.id === template.category_id)
                      ?.transaction_type === "expense"
                      ? (-Number(template.amount)).toFixed(2)
                      : template.amount
                  }
                  className="text-sm font-semibold text-amber-900"
                />
                <Button
                  size="sm"
                  className="bg-amber-600 hover:bg-amber-700"
                  onClick={() => generateMutation.mutate(template.id)}
                  disabled={generateMutation.isPending}
                >
                  <Play className="mr-1 h-3.5 w-3.5" /> Record
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}