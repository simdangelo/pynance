import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Pencil, Plus, Repeat, Trash2 } from "lucide-react"

import { api } from "@/lib/api"
import type { Category, RecurringTemplate } from "@/types/api"
import { Money } from "@/components/money"
import { frequencyLabel } from "@/components/frequency-label"
import { RecurringDialog } from "@/components/recurring-dialog"
import { TypeBadge } from "@/components/type-badge"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { DueNowCard } from "@/components/due-now-card"
import { EmptyState } from "@/components/empty-state"
import { Stat } from "@/components/stat"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

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
      <Badge variant="secondary" className="bg-secondary text-muted-foreground">
        Paused
      </Badge>
    )
  }
  if (!template.due) {
    return (
      <Badge variant="secondary" className="bg-moss/15 text-moss">
        Active
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="bg-ochre/15 text-ochre">
      Overdue
    </Badge>
  )
}

function categoryType(categories: Category[] | undefined, categoryId: number) {
  return categories?.find((c) => c.id === categoryId)?.transaction_type
}

export default function Recurring() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<RecurringTemplate | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RecurringTemplate | null>(null)

  const { data: templates, isLoading, isError } = useQuery({
    queryKey: ["recurring"],
    queryFn: api.recurringTemplates.list,
  })

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: api.categories.list,
  })

  const dueTemplates = (templates ?? []).filter((t) => t.active && t.due)

  const activeCount = (templates ?? []).filter((t) => t.active).length
  const pausedCount = (templates ?? []).filter((t) => !t.active).length

  const deleteMutation = useMutation({
    mutationFn: api.recurringTemplates.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring"] })
    },
    onError: () => toast.error("Failed to delete template"),
  })

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  return (
    <div className="space-y-5">
      {/* Top band: stats + Add */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <section className="flex flex-wrap items-baseline gap-x-10 gap-y-3">
          <Stat label="Active" value={activeCount} size="lg" />
          <Stat label="Due" value={dueTemplates.length} size="lg" tone="attention" />
          <Stat label="Paused" value={pausedCount} size="lg" />
        </section>
        <Button onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" /> Add template
        </Button>
      </div>

      {/* Due now — only when something is due */}
      {dueTemplates.length > 0 && (
        <DueNowCard templates={dueTemplates} categories={categories} />
      )}

      {/* Templates */}
      <Card className="p-0">
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : isError ? (
            <p className="p-6 text-sm text-destructive">Failed to load templates.</p>
          ) : !templates || templates.length === 0 ? (
            <EmptyState
              icon={Repeat}
              title="No recurring templates"
              subtitle="Create a template for recurring income or expenses, then generate each occurrence when it happens."
              action={
                <Button size="sm" onClick={openCreate}>
                  <Plus className="mr-1 h-4 w-4" /> Add template
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Next occurrence</TableHead>
                  <TableHead className="w-[120px] text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell>
                      <span className="block max-w-[240px] truncate">
                        {template.description}
                      </span>
                    </TableCell>
                    <TableCell>
                      <CategoryCell categoryId={template.category_id} categories={categories} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {frequencyLabel(template.frequency, template.interval)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "font-numeric text-sm",
                        template.due ? "text-ochre" : "",
                      )}
                    >
                      {template.next_occurrence}
                    </TableCell>
                    <TableCell className="text-right">
                      <Money
                        value={
                          categoryType(categories, template.category_id) === "income"
                            ? template.amount
                            : (-Number(template.amount)).toFixed(2)
                        }
                        className={cn(
                          "font-medium",
                          categoryType(categories, template.category_id) === "income"
                            ? "text-moss"
                            : "text-clay",
                        )}
                      />
                    </TableCell>
                    <TableCell>
                      <StatusBadge template={template} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
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
                          size="icon-sm"
                          aria-label="Delete template"
                          onClick={() => setDeleteTarget(template)}
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

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete template?"
        description={
          deleteTarget
            ? `"${deleteTarget.description}" (${frequencyLabel(deleteTarget.frequency, deleteTarget.interval)}) will be permanently removed. Existing generated transactions are kept.`
            : undefined
        }
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  )
}