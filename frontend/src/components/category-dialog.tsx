import { useEffect, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { api, ApiError } from "@/lib/api"
import type { Category, TransactionType } from "@/types/api"
import { TypeToggle } from "@/components/type-toggle"
import { Button } from "@/components/ui/button"
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

interface CategoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  category?: Category | null
}

export function CategoryDialog({ open, onOpenChange, category }: CategoryDialogProps) {
  const queryClient = useQueryClient()
  const isEditing = Boolean(category)

  const [name, setName] = useState("")
  const [type, setType] = useState<TransactionType>("expense")

  useEffect(() => {
    if (open) {
      setName(category?.name ?? "")
      setType(category?.transaction_type ?? "expense")
    }
  }, [open, category])

  const mutation = useMutation({
    mutationFn: (data: { name: string; transaction_type: TransactionType }) =>
      isEditing && category
        ? api.categories.update(category.id, data)
        : api.categories.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] })
      onOpenChange(false)
      toast.success(isEditing ? "Category updated" : "Category created")
    },
    onError: (error: Error) => {
      const message =
        error instanceof ApiError && error.status === 409
          ? "A category with this name already exists"
          : isEditing
            ? "Failed to update category"
            : "Failed to create category"
      toast.error(message)
    },
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    mutation.mutate({ name: name.trim(), transaction_type: type })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit category" : "Add category"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Rename or change the type of the category."
              : "Create a category to tag your transactions."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Groceries"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <TypeToggle value={type} onChange={setType} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {isEditing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}