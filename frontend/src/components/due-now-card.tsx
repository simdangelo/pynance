import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Play } from "lucide-react"

import { api, ApiError } from "@/lib/api"
import type { Category, RecurringTemplate } from "@/types/api"
import { Money } from "@/components/money"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { frequencyLabel } from "@/components/frequency-label"

export function DueNowCard({
  templates,
  categories,
}: {
  templates: RecurringTemplate[]
  categories?: Category[]
}) {
  const queryClient = useQueryClient()

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

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Due now</CardTitle>
        <Badge variant="secondary" className="bg-ochre/10 text-ochre">
          {templates.length} due
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="-my-2 divide-y divide-border">
          {templates.map((template) => {
            const income =
              categories?.find((c) => c.id === template.category_id)
                ?.transaction_type === "income"
            return (
              <div
                key={template.id}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {template.description}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {frequencyLabel(template.frequency, template.interval)} ·
                    was due {template.next_occurrence}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Money
                    value={
                      income
                        ? template.amount
                        : (-Number(template.amount)).toFixed(2)
                    }
                    className={cn(
                      "text-sm font-medium",
                      income ? "text-moss" : "text-clay",
                    )}
                  />
                  <Button
                    size="sm"
                    onClick={() => generateMutation.mutate(template.id)}
                    disabled={generateMutation.isPending}
                  >
                    <Play className="mr-1 h-3.5 w-3.5" /> Record
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}