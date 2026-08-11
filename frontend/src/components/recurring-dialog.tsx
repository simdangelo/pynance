import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { api } from "@/lib/api"
import { todayLocalISO } from "@/lib/utils"
import type { Frequency, RecurringTemplate } from "@/types/api"
import { TypeBadge } from "@/components/type-badge"
import { frequencyLabel } from "@/components/frequency-label"
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

interface RecurringDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  template?: RecurringTemplate | null
}

const FREQUENCIES: Frequency[] = ["monthly", "weekly", "yearly", "custom"]

export function RecurringDialog({ open, onOpenChange, template }: RecurringDialogProps) {
  const queryClient = useQueryClient()
  const isEditing = Boolean(template)

  const [description, setDescription] = useState("")
  const [amount, setAmount] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [frequency, setFrequency] = useState<Frequency>("monthly")
  const [interval, setInterval] = useState("1")
  const [nextOccurrence, setNextOccurrence] = useState("")
  const [active, setActive] = useState("true")

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: api.categories.list,
  })

  useEffect(() => {
    if (open) {
      setDescription(template?.description ?? "")
      setAmount(template?.amount ?? "")
      setCategoryId(template ? String(template.category_id) : "")
      setFrequency(template?.frequency ?? "monthly")
      setInterval(String(template?.interval ?? 1))
      setNextOccurrence(template?.next_occurrence ?? todayLocalISO())
      setActive(String(template?.active ?? true))
    }
  }, [open, template])

  const selectedCategory = useMemo(
    () => categories?.find((c) => String(c.id) === categoryId),
    [categories, categoryId],
  )

  const mutation = useMutation({
    mutationFn: (data: Parameters<typeof api.recurringTemplates.create>[0]) =>
      isEditing && template
        ? api.recurringTemplates.update(template.id, data)
        : api.recurringTemplates.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring"] })
      onOpenChange(false)
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save recurring template")
    },
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCategory) return
    mutation.mutate({
      description,
      amount,
      category_id: Number(categoryId),
      frequency,
      interval: Number(interval) || 1,
      next_occurrence: nextOccurrence,
      active: active === "true",
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit recurring template" : "Add recurring template"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Changes apply to future occurrences only; generated transactions keep their values."
              : "Define a template and generate its transactions when they happen."}
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
            <Label>Description</Label>
            <Input
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Rent"
              className="mt-1.5"
            />
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as Frequency)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue>{frequencyLabel(frequency, Number(interval) || 1)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Interval</Label>
              <Input
                type="number"
                min="1"
                step="1"
                required
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
                className="mt-1.5 font-numeric"
                aria-label="Interval"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {frequencyLabel(frequency, Number(interval) || 2)}
              </p>
            </div>
          </div>
          <div>
            <Label>Next occurrence</Label>
            <Input
              required
              value={nextOccurrence}
              onChange={(e) => setNextOccurrence(e.target.value)}
              placeholder="YYYY-MM-DD"
              pattern="\d{4}-\d{2}-\d{2}"
              className="mt-1.5 font-numeric"
            />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={active} onValueChange={(v) => { if (v) setActive(v) }}>
              <SelectTrigger className="mt-1.5">
                <SelectValue>{active === "true" ? "Active" : "Paused"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Active</SelectItem>
                <SelectItem value="false">Paused</SelectItem>
              </SelectContent>
            </Select>
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
