import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { api } from "@/lib/api"
import { todayLocalISO } from "@/lib/utils"
import type { Transaction } from "@/types/api"
import { TypeBadge } from "@/components/type-badge"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface TransactionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction?: Transaction | null
}

export function TransactionDialog({ open, onOpenChange, transaction }: TransactionDialogProps) {
  const queryClient = useQueryClient()
  const isEditing = Boolean(transaction)

  const [amount, setAmount] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [description, setDescription] = useState("")
  const [occurredOn, setOccurredOn] = useState("")

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: api.categories.list,
  })

  useEffect(() => {
    if (open) {
      setAmount(transaction?.amount ?? "")
      setCategoryId(transaction ? String(transaction.category_id) : "")
      setDescription(transaction?.description ?? "")
      setOccurredOn(transaction?.occurred_on ?? todayLocalISO())
    }
  }, [open, transaction])

  const selectedCategory = useMemo(
    () => categories?.find((c) => String(c.id) === categoryId),
    [categories, categoryId],
  )

  const mutation = useMutation({    mutationFn: (data: unknown) =>
      isEditing && transaction
        ? api.transactions.update(transaction.id, data)
        : api.transactions.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] })
      onOpenChange(false)
    },
    onError: () => toast.error("Failed to save transaction"),
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate({
      amount,
      category_id: Number(categoryId),
      description,
      occurred_on: occurredOn,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit transaction" : "Add transaction"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the details of this transaction."
              : "Record a new income or expense."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>Category</Label>
            <Select
              value={categoryId}
              onValueChange={(v) => {
                if (v) setCategoryId(v)
              }}
              required
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue>
                  {selectedCategory ? (
                    <span className="flex items-center gap-2">
                      {selectedCategory.name}
                      <TypeBadge type={selectedCategory.transaction_type} />
                    </span>
                  ) : (
                    "Select a category"
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="min-w-[240px]">
                {categories?.map((category) => (
                  <SelectItem key={category.id} value={String(category.id)}>
                    <span className="flex items-center gap-2">
                      {category.name}
                      <TypeBadge type={category.transaction_type} />
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Amount</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="mt-1.5 font-numeric"
            />
          </div>
          <div>
            <Label>Description</Label>
            <Input
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Weekly groceries"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Date</Label>
            <Input
              required
              value={occurredOn}
              onChange={(e) => setOccurredOn(e.target.value)}
              placeholder="YYYY-MM-DD"
              pattern="\d{4}-\d{2}-\d{2}"
              className="mt-1.5 font-numeric"
            />
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
