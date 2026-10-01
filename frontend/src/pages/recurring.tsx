import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Pencil, Plus, Repeat, Trash2 } from "lucide-react"

import { api } from "@/lib/api"
import type { Category, RecurringTemplate } from "@/types/api"
import { Money } from "@/components/money"
import { frequencyLabel } from "@/components/frequency-label"
import { RecurringDialog } from "@/components/recurring-dialog"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { DueNowCard } from "@/components/due-now-card"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { RowActions } from "@/components/row-actions"
import { Stat } from "@/components/stat"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

function StatusBadge({ template }: { template: RecurringTemplate }) {
  if (!template.active) {
    return (
      <Badge variant="secondary" className="bg-muted text-muted-foreground">
        Paused
      </Badge>
    )
  }
  if (!template.due) {
    return (
      <Badge variant="secondary" className="bg-positive-soft text-positive">
        Active
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="bg-destructive-soft text-destructive">
      Overdue
    </Badge>
  )
}

function categoryType(categories: Category[] | undefined, categoryId: number) {
  return categories?.find((c) => c.id === categoryId)?.transaction_type
}

function categoryName(categories: Category[] | undefined, categoryId: number) {
  return categories?.find((c) => c.id === categoryId)?.name ?? "Unknown"
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
      <PageHeader
        title="Recurring"
        action={
          <Button onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" /> Add template
          </Button>
        }
      />

      {/* Counts */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat label="Active" value={activeCount} size="lg" />
          <Stat
            label="Due"
            value={dueTemplates.length}
            size="lg"
            tone="negative"
            className="sm:border-l sm:border-border sm:pl-4"
          />
          <Stat
            label="Paused"
            value={pausedCount}
            size="lg"
            className="sm:border-l sm:border-border sm:pl-4"
          />
        </CardContent>
      </Card>

      {/* Due now — only when something is due */}
      {dueTemplates.length > 0 && (
        <DueNowCard templates={dueTemplates} categories={categories} />
      )}

      {/* Templates */}
      <Card className="gap-0 overflow-hidden py-0">
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
                  <TableHead className="w-[1%] text-right">Amount</TableHead>
                  <TableHead className="w-[1%]">Status</TableHead>
                  <TableHead className="w-[44px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => {
                  const income =
                    categoryType(categories, template.category_id) === "income"
                  return (
                    <TableRow key={template.id}>
                      <TableCell>
                        <span className="block max-w-[240px] truncate">
                          {template.description}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {categoryName(categories, template.category_id)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {frequencyLabel(template.frequency, template.interval)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "font-numeric text-sm",
                          template.due
                            ? "text-destructive"
                            : "text-muted-foreground",
                        )}
                      >
                        {template.next_occurrence}
                      </TableCell>
                      <TableCell className="w-[1%] text-right">
                        <Money
                          value={
                            income
                              ? template.amount
                              : (-Number(template.amount)).toFixed(2)
                          }
                          signed
                          className={cn(
                            "font-medium",
                            income ? "text-positive" : "text-destructive",
                          )}
                        />
                      </TableCell>
                      <TableCell className="w-[1%]">
                        <StatusBadge template={template} />
                      </TableCell>
                      <TableCell className="w-[44px] text-right">
                        <div className="flex justify-end">
                          <RowActions label={`Actions for ${template.description}`}>
                            <DropdownMenuItem
                              onClick={() => {
                                setEditing(template)
                                setDialogOpen(true)
                              }}
                            >
                              <Pencil /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setDeleteTarget(template)}
                            >
                              <Trash2 /> Delete
                            </DropdownMenuItem>
                          </RowActions>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
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
