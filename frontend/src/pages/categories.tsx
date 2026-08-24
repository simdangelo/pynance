import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Pencil, Plus, Tags, Trash2 } from "lucide-react"

import { api } from "@/lib/api"
import type { Category } from "@/types/api"
import { CategoryDialog } from "@/components/category-dialog"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { EmptyState } from "@/components/empty-state"
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

const TYPE_META = {
  expense: { label: "Expense", dot: "var(--color-clay)" },
  income: { label: "Income", dot: "var(--color-moss)" },
} as const

export default function Categories() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)

  const { data: categories, isLoading, isError } = useQuery({
    queryKey: ["categories"],
    queryFn: api.categories.list,
  })

  const groups = useMemo(
    () => ({
      expense: (categories ?? [])
        .filter((c) => c.transaction_type === "expense")
        .sort((a, b) => a.name.localeCompare(b.name)),
      income: (categories ?? [])
        .filter((c) => c.transaction_type === "income")
        .sort((a, b) => a.name.localeCompare(b.name)),
    }),
    [categories],
  )

  const deleteMutation = useMutation({
    mutationFn: api.categories.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] })
      toast.success("Category deleted")
    },
    onError: () => {
      toast.error("Failed to delete category")
    },
  })

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (category: Category) => {
    setEditing(category)
    setDialogOpen(true)
  }

  const renderGroup = (type: "expense" | "income") => {
    const meta = TYPE_META[type]
    const items = groups[type]
    return (
      <section>
        <div className="mb-2 flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ backgroundColor: meta.dot }} />
          <span className="text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">
            {meta.label}
          </span>
          <span className="ml-auto font-numeric text-xs text-muted-foreground/70">
            {items.length}
          </span>
        </div>
        <Card className="p-0">
          <CardContent className="p-0">
            {items.length === 0 ? (
              <EmptyState
                icon={Tags}
                title={`No ${meta.label.toLowerCase()} categories yet`}
                subtitle="Add one to tag your transactions."
                className="py-8"
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((category) => (
                    <TableRow key={category.id}>
                      <TableCell className="font-medium">{category.name}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Edit ${category.name}`}
                            onClick={() => openEdit(category)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Delete ${category.name}`}
                            onClick={() => setDeleteTarget(category)}
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
      </section>
    )
  }

  return (
    <div className="space-y-5">
      {/* Add action */}
      <div className="flex flex-wrap items-center justify-end gap-4">
        <Button onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" /> Add category
        </Button>
      </div>

      {/* Two tables: income / expense */}
      {isLoading ? (
        <p className="py-6 text-sm text-muted-foreground">Loading…</p>
      ) : isError ? (
        <p className="py-6 text-sm text-destructive">Failed to load categories.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {renderGroup("expense")}
          {renderGroup("income")}
        </div>
      )}

      <CategoryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        category={editing}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete category?"
        description={
          deleteTarget
            ? `"${deleteTarget.name}" will be permanently removed. Categories with transactions cannot be deleted.`
            : undefined
        }
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  )
}