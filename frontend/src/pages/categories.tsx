import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Pencil, Trash2 } from "lucide-react"

import { api, ApiError } from "@/lib/api"
import type { Category, TransactionType } from "@/types/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

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

export default function Categories() {
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [type, setType] = useState<TransactionType>("expense")
  const [editing, setEditing] = useState<Category | null>(null)
  const [editName, setEditName] = useState("")
  const [editType, setEditType] = useState<TransactionType>("expense")

  const { data: categories, isLoading, isError } = useQuery({
    queryKey: ["categories"],
    queryFn: api.categories.list,
  })

  const createMutation = useMutation({
    mutationFn: api.categories.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] })
      setName("")
    },
    onError: (error: Error) => {
      const message =
        error instanceof ApiError && error.status === 409
          ? "A category with this name already exists"
          : "Failed to create category"
      toast.error(message)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: { id: number; name?: string; transaction_type?: string }) =>
      api.categories.update(data.id, {
        name: data.name,
        transaction_type: data.transaction_type,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] })
      setEditing(null)
    },
    onError: (error: Error) => {
      const message =
        error instanceof ApiError && error.status === 409
          ? "A category with this name already exists"
          : "Failed to update category"
      toast.error(message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: api.categories.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] })
    },
    onError: (error: Error) => {
      const message =
        error instanceof ApiError && error.status === 409
          ? "Cannot delete: this category has transactions"
          : "Failed to delete category"
      toast.error(message)
    },
  })

  const openEdit = (category: Category) => {
    setEditing(category)
    setEditName(category.name)
    setEditType(category.transaction_type)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
        <p className="mt-1 text-muted-foreground">
          The categories used to tag your transactions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add category</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (name.trim()) {
                createMutation.mutate({ name: name.trim(), transaction_type: type })
              }
            }}
          >
            <div className="min-w-[200px] flex-1">
              <Label htmlFor="category-name">Name</Label>
              <Input
                id="category-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Groceries"
                className="mt-1.5"
              />
            </div>
            <div className="min-w-[140px]">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as TransactionType)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">expense</SelectItem>
                  <SelectItem value="income">income</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={createMutation.isPending}>
              Add
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All categories</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : isError ? (
            <p className="text-sm text-destructive">Failed to load categories.</p>
          ) : categories && categories.length > 0 ? (
            <ul className="divide-y divide-border">
              {categories.map((category: Category) => (
                <li
                  key={category.id}
                  className="flex items-center justify-between py-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{category.name}</span>
                    <TypeBadge type={category.transaction_type} />
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${category.name}`}
                      onClick={() => openEdit(category)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${category.name}`}
                      onClick={() => deleteMutation.mutate(category.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No categories yet.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit category</DialogTitle>
            <DialogDescription>Rename or change the type of the category.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (editing && editName.trim()) {
                updateMutation.mutate({
                  id: editing.id,
                  name: editName.trim(),
                  transaction_type: editType,
                })
              }
            }}
          >
            <div>
              <Label>Name</Label>
              <Input
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={editType} onValueChange={(v) => setEditType(v as TransactionType)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">expense</SelectItem>
                  <SelectItem value="income">income</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
