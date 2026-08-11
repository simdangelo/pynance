import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Pencil, Play, Plus, Trash2 } from "lucide-react"

import { api, ApiError } from "@/lib/api"
import type { Category, Frequency, RecurringTemplate, TransactionType } from "@/types/api"
import { Money } from "@/components/money"
import { RecurringDialog } from "@/components/recurring-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

function TypeBadge({ type }: { type: TransactionType }) {
  return type === "income" ? (
    <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
      income
    </Badge>
  ) : (
    <Badge variant="secondary" className="bg-rose-50 text-rose-700">
      expense
    </Badge>
  )
}

const FREQUENCY_UNIT: Record<Frequency, string> = {
  monthly: "month",
  weekly: "week",
  yearly: "year",
  custom: "week",
}

function frequencyLabel(frequency: Frequency, interval: number): string {
  if (interval === 1) return frequency
  const plural = interval > 1 ? "s" : ""
  return `every ${interval} ${FREQUENCY_UNIT[frequency]}${plural}`
}

function CategoryCell({
  categoryId,
  categories,
}: {
  categoryId: number
  categories?: Category[]
}) {
  const category = categories?.find((c) => c.id === categoryId)
  return (
    <span className="flex items-center gap-2">
      {category?.name ?? "Unknown"}
      {category && <TypeBadge type={category.transaction_type} />}
    </span>
  )
}

function StatusBadge({ template }: { template: RecurringTemplate }) {
  if (!template.active) {
    return (
      <Badge variant="secondary" className="bg-muted text-muted-foreground">
        paused
      </Badge>
    )
  }
  if (!template.due) {
    return (
      <Badge variant="secondary" className="bg-sky-50 text-sky-700">
        scheduled
      </Badge>
    )
  }
  return (
    <Badge variant="destructive" className="bg-amber-50 text-amber-700">
      overdue
    </Badge>
  )
}

export default function Recurring() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<RecurringTemplate | null>(null)

  const { data: templates, isLoading, isError } = useQuery({
    queryKey: ["recurring"],
    queryFn: api.recurringTemplates.list,
  })

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: api.categories.list,
  })

  const generateMutation = useMutation({
    mutationFn: api.recurringTemplates.generate,
    onSuccess: (transaction) => {
      queryClient.invalidateQueries({ queryKey: ["recurring"] })
      queryClient.invalidateQueries({ queryKey: ["transactions"] })
      toast.success(`Generated "${transaction.description}" for ${transaction.occurred_on}`)
    },
    onError: (error: Error) => {
      const message =
        error instanceof ApiError && error.status === 409
          ? "Template is paused"
          : "Failed to generate transaction"
      toast.error(message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: api.recurringTemplates.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring"] })
    },
    onError: () => toast.error("Failed to delete template"),
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Recurring</h1>
          <p className="mt-1 text-muted-foreground">
            Templates that generate transactions when they happen.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recurring templates</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : isError ? (
            <p className="text-sm text-destructive">Failed to load templates.</p>
          ) : !templates || templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No templates yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Next occurrence</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[120px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell>{template.description}</TableCell>
                    <TableCell>
                      <CategoryCell categoryId={template.category_id} categories={categories} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {frequencyLabel(template.frequency, template.interval)}
                    </TableCell>
                    <TableCell
                      className={`font-numeric text-sm ${template.due ? "text-amber-600" : ""}`}
                    >
                      {template.next_occurrence}
                    </TableCell>
                    <TableCell className="text-right font-numeric">
                      <Money value={template.amount} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge template={template} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Generate ${template.description}`}
                          onClick={() => generateMutation.mutate(template.id)}
                          disabled={!template.active || !template.due || generateMutation.isPending}
                          title={
                            !template.active
                              ? "Template is paused"
                              : !template.due
                                ? `Not due until ${template.next_occurrence}`
                                : "Generate the next occurrence"
                          }
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Edit template"
                          onClick={() => {
                            setEditing(template)
                            setDialogOpen(true)
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Delete template"
                          onClick={() => deleteMutation.mutate(template.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <RecurringDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        template={editing}
      />
    </div>
  )
}
