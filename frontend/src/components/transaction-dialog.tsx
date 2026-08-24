import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Landmark } from "lucide-react"

import { api } from "@/lib/api"
import { todayLocalISO } from "@/lib/utils"
import type { Transaction, TransactionType } from "@/types/api"
import { Money } from "@/components/money"
import { DateField } from "@/components/date-field"
import { TypeToggle } from "@/components/type-toggle"
import { cn } from "@/lib/utils"
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

  const [type, setType] = useState<TransactionType>("income")
  const [amount, setAmount] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [assetId, setAssetId] = useState("")
  const [description, setDescription] = useState("")
  const [occurredOn, setOccurredOn] = useState("")

  // Remember the last category chosen for each type, so toggling back restores it.
  const categoryByType = useRef<Partial<Record<TransactionType, number>>>({})

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: api.categories.list,
  })

  const { data: assets } = useQuery({
    queryKey: ["assets"],
    queryFn: api.assets.list,
  })

  useEffect(() => {
    if (open) {
      setType(transaction?.transaction_type ?? "income")
      setAmount(transaction?.amount ?? "")
      setCategoryId(transaction ? String(transaction.category_id) : "")
      setAssetId(transaction ? String(transaction.asset_id) : "")
      setDescription(transaction?.description ?? "")
      setOccurredOn(transaction?.occurred_on ?? todayLocalISO())
      if (transaction && transaction.transaction_type) {
        categoryByType.current[transaction.transaction_type] = transaction.category_id
      }
    }
  }, [open, transaction])

  const income = type === "income"

  const filteredCategories = useMemo(
    () => (categories ?? []).filter((c) => c.transaction_type === type),
    [categories, type],
  )

  const selectedCategory = useMemo(
    () => categories?.find((c) => String(c.id) === categoryId),
    [categories, categoryId],
  )

  const selectedAsset = useMemo(
    () => assets?.find((a) => String(a.id) === assetId),
    [assets, assetId],
  )

  const handleTypeChange = (newType: TransactionType) => {
    setType(newType)
    const saved = categoryByType.current[newType]
    setCategoryId(saved ? String(saved) : "")
  }

  const mutation = useMutation({
    mutationFn: (data: unknown) =>
      isEditing && transaction
        ? api.transactions.update(transaction.id, data)
        : api.transactions.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries()
      onOpenChange(false)
    },
    onError: () => toast.error("Failed to save transaction"),
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate({
      amount,
      category_id: Number(categoryId),
      asset_id: Number(assetId),
      description,
      occurred_on: occurredOn,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit transaction" : "Add transaction"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the details of this transaction."
              : "Record a new income or expense."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {/* Type toggle */}
          <TypeToggle value={type} onChange={handleTypeChange} />

          {/* Category */}
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select
              value={categoryId}
              onValueChange={(v) => {
                if (v) {
                  setCategoryId(v)
                  categoryByType.current[type] = Number(v)
                }
              }}
              required
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {selectedCategory ? selectedCategory.name : "Select a category"}
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

          {/* Asset */}
          <div className="space-y-1.5">
            <Label>Asset</Label>
            <Select
              value={assetId}
              onValueChange={(v) => {
                if (v) setAssetId(v)
              }}
              required
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {selectedAsset ? (
                    <span className="flex items-center gap-2">
                      <Landmark className="size-4 text-muted-foreground" />
                      {selectedAsset.name}
                    </span>
                  ) : (
                    "Select an asset"
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {assets?.map((asset) => (
                  <SelectItem key={asset.id} value={String(asset.id)}>
                    {asset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <Label>Amount</Label>
            <div className="relative">
              <span
                className={cn(
                  "pointer-events-none absolute inset-y-0 left-3 flex items-center font-numeric text-lg font-medium",
                  income ? "text-moss" : "text-clay",
                )}
              >
                {income ? "+" : "−"} €&nbsp;
              </span>
              <Input
                type="number"
                step="0.01"
                min="0"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="h-10 pl-12 font-numeric text-lg"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Weekly groceries"
            />
          </div>

          {/* Date */}
          <DateField
            label="Date"
            value={occurredOn}
            onChange={setOccurredOn}
            required
          />

          {/* Preview line */}
          <div
            className={cn(
              "flex items-center justify-between rounded-lg px-3.5 py-2.5",
              income ? "bg-moss/10" : "bg-clay/10",
            )}
          >
            <span className="text-sm text-muted-foreground">
              Adds to <span className="font-medium text-foreground">{selectedAsset?.name ?? "—"}</span>
            </span>
            <Money
              value={amount || "0"}
              signed
              className={cn(
                "font-medium",
                income ? "text-moss" : "text-clay",
              )}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {isEditing ? "Save" : income ? "Add income" : "Add expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}