import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { api, ApiError } from "@/lib/api"
import type { Transaction, TransactionType } from "@/types/api"
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

  const [transactionType, setTransactionType] = useState<TransactionType>("expense")
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
      setTransactionType(transaction?.transaction_type ?? "expense")
      setAmount(transaction?.amount ?? "")
      setCategoryId(transaction ? String(transaction.category_id) : "")
      setDescription(transaction?.description ?? "")
      setOccurredOn(transaction?.occurred_on ?? new Date().toISOString().slice(0, 10))
    }
  }, [open, transaction])

  const filteredCategories =
    categories?.filter((c) => c.transaction_type === transactionType) ?? []

  const mutation = useMutation({
    mutationFn: (data: unknown) =>
      isEditing && transaction
        ? api.transactions.update(transaction.id, data)
        : api.transactions.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] })
      onOpenChange(false)
    },
    onError: (error: Error) => {
      const message =
        error instanceof ApiError && error.status === 422
          ? "The transaction type does not match the selected category"
          : "Failed to save transaction"
      toast.error(message)
    },
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate({
      transaction_type: transactionType,
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Type</Label>
              <Select
                value={transactionType}
                onValueChange={(v) => {
                  setTransactionType(v as TransactionType)
                  setCategoryId("")
                }}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">expense</SelectItem>
                  <SelectItem value="income">income</SelectItem>
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
          </div>
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
                  {categoryId
                    ? filteredCategories.find((c) => String(c.id) === categoryId)?.name ??
                      "Select a category"
                    : "Select a category"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {filteredCategories.map((category) => (
                  <SelectItem key={category.id} value={String(category.id)}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
