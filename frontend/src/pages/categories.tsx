import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Pencil, Plus, Tags, Trash2 } from "lucide-react"

import { api } from "@/lib/api"
import type { Category } from "@/types/api"
import { CategoryDialog } from "@/components/category-dialog"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { RowActions } from "@/components/row-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const TYPE_META = {
  expense: { label: "Expense", dot: "bg-destructive" },
  income: { label: "Income", dot: "bg-positive" },
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
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="py-4">
          <CardTitle className="flex items-center gap-2">
            <span className={`size-2 shrink-0 rounded-full ${meta.dot}`} />
            {meta.label}
            <span className="rounded-full bg-muted px-2 py-0.5 font-numeric text-[11px] font-medium text-muted-foreground">
              {items.length}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <EmptyState
              icon={Tags}
              title={`No ${meta.label.toLowerCase()} categories yet`}
              subtitle="Add one to tag your transactions."
            />
          ) : (
            <Table>
              <TableHeader className="sr-only">
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((category) => (
                  <TableRow key={category.id}>
                    <TableCell className="font-medium">{category.name}</TableCell>
                    <TableCell className="w-[1%] text-right">
                      <div className="flex justify-end">
                        <RowActions label={`Actions for ${category.name}`}>
                          <DropdownMenuItem onClick={() => openEdit(category)}>
                            <Pencil /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setDeleteTarget(category)}
                          >
                            <Trash2 /> Delete
                          </DropdownMenuItem>
                        </RowActions>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Categories"
        action={
          <Button onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" /> Add category
          </Button>
        }
      />

      {isLoading ? (
        <p className="py-6 text-sm text-muted-foreground">Loading…</p>
      ) : isError ? (
        <p className="py-6 text-sm text-destructive">Failed to load categories.</p>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
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