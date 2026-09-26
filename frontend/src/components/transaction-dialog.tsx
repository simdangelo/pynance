import { useEffect, useMemo, useState } from "react"
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

interface Draft {
  amount: string
  categoryId: string
  assetId: string
  description: string
  occurredOn: string
}

const emptyDraft = (): Draft => ({
  amount: "",
  categoryId: "",
  assetId: "",
  description: "",
  occurredOn: todayLocalISO(),
})

export function TransactionDialog({ open, onOpenChange, transaction }: TransactionDialogProps) {
  const queryClient = useQueryClient()
  const isEditing = Boolean(transaction)

  const [type, setType] = useState<TransactionType>("income")
  const [drafts, setDrafts] = useState<Record<TransactionType, Draft>>({
    income: emptyDraft(),
    expense: emptyDraft(),
  })
  const [formError, setFormError] = useState("")

  const draft = drafts[type]

  const updateDraft = (patch: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [type]: { ...prev[type], ...patch } }))

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: api.categories.list,
  })

  const { data: assets } = useQuery({
    queryKey: ["assets"],
    queryFn: api.assets.list,
  })

  useEffect(() => {
    if (!open) return

    // A new transaction starts from a clean slate for both types; editing
    // seeds only the draft of the transaction's own type.
    if (transaction) {
      setType(transaction.transaction_type)
      setDrafts({
        income: emptyDraft(),
        expense: emptyDraft(),
        [transaction.transaction_type]: {
          amount: transaction.amount,
          categoryId: String(transaction.category_id),
          assetId: String(transaction.asset_id),
          description: transaction.description,
          occurredOn: transaction.occurred_on,
        },
      })
    } else {
      setType("income")
      setDrafts({ income: emptyDraft(), expense: emptyDraft() })
    }
    setFormError("")
  }, [open, transaction])

  const income = type === "income"

  const filteredCategories = useMemo(
    () => (categories ?? []).filter((c) => c.transaction_type === type),
    [categories, type],
  )

  const selectedCategory = useMemo(
    () => categories?.find((c) => String(c.id) === draft.categoryId),
    [categories, draft.categoryId],
  )

  const selectedAsset = useMemo(
    () => assets?.find((a) => String(a.id) === draft.assetId),
    [assets, draft.assetId],
  )

  const handleTypeChange = (newType: TransactionType) => setType(newType)

  const mutation = useMutation({
    mutationFn: (data: unknown) =>
      isEditing && transaction
        ? api.transactions.update(transaction.id, data)
        : api.transactions.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries()
      onOpenChange(false)
    },
    onError: (error: Error) => toast.error(error.message || "Failed to save transaction"),
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!draft.categoryId) {
      setFormError("Select a category first")
      return
    }
    if (!draft.assetId) {
      setFormError("Select an asset first")
      return
    }
    setFormError("")
    mutation.mutate({
      amount: draft.amount,
      category_id: Number(draft.categoryId),
      asset_id: Number(draft.assetId),
      description: draft.description,
      occurred_on: draft.occurredOn,
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
            {filteredCategories.length === 0 ? (
              <div className="rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
                No {income ? "income" : "expense"} categories yet. Create one in the
                Categories page first.
              </div>
            ) : (
              <Select
                value={draft.categoryId}
                onValueChange={(v) => {
                  if (v) updateDraft({ categoryId: v })
                }}
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
            )}
          </div>

          {/* Asset */}
          <div className="space-y-1.5">
            <Label>Asset</Label>
            {assets && assets.length === 0 ? (
              <div className="rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
                No assets yet. Create one in the Assets page first.
              </div>
            ) : (
              <Select
                value={draft.assetId}
                onValueChange={(v) => {
                  if (v) updateDraft({ assetId: v })
                }}
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
            )}
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
                value={draft.amount}
                onChange={(e) => updateDraft({ amount: e.target.value })}
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
              value={draft.description}
              onChange={(e) => updateDraft({ description: e.target.value })}
              placeholder="e.g. Weekly groceries"
            />
          </div>

          {/* Date */}
          <DateField
            label="Date"
            value={draft.occurredOn}
            onChange={(value) => updateDraft({ occurredOn: value })}
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
              value={draft.amount || "0"}
              signed
              className={cn(
                "font-medium",
                income ? "text-moss" : "text-clay",
              )}
            />
          </div>

          {formError && (
            <div className="rounded-lg border border-clay/30 bg-clay/10 px-3.5 py-2.5 text-sm text-clay">
              {formError}
            </div>
          )}

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