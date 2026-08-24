import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { api } from "@/lib/api"
import { todayLocalISO } from "@/lib/utils"
import type { Frequency, RecurringTemplate, TransactionType } from "@/types/api"
import { Money } from "@/components/money"
import { DateField } from "@/components/date-field"
import { TypeToggle } from "@/components/type-toggle"
import { frequencyLabel } from "@/components/frequency-label"
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

interface RecurringDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  template?: RecurringTemplate | null
}

const FREQUENCIES: Frequency[] = ["monthly", "weekly", "yearly", "custom"]

export function RecurringDialog({ open, onOpenChange, template }: RecurringDialogProps) {
  const queryClient = useQueryClient()
  const isEditing = Boolean(template)

  const [type, setType] = useState<TransactionType>("income")
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

  // Remember the last category chosen for each type, so toggling back restores it.
  const categoryByType = useRef<Partial<Record<TransactionType, number>>>({})

  const selectedCategory = useMemo(
    () => categories?.find((c) => String(c.id) === categoryId),
    [categories, categoryId],
  )

  const income = type === "income"

  const filteredCategories = useMemo(
    () => (categories ?? []).filter((c) => c.transaction_type === type),
    [categories, type],
  )

  // When editing, derive the type from the template's category once categories are loaded.
  useEffect(() => {
    if (open && template && categories && categoryId) {
      const category = categories.find((c) => String(c.id) === categoryId)
      if (category) {
        setType(category.transaction_type)
        categoryByType.current[category.transaction_type] = Number(categoryId)
      }
    }
  }, [open, template, categories, categoryId])

  const handleTypeChange = (newType: TransactionType) => {
    setType(newType)
    const saved = categoryByType.current[newType]
    setCategoryId(saved ? String(saved) : "")
  }

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

  const freq = frequencyLabel(frequency, Number(interval) || 1)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
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

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Rent"
            />
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

          {/* Frequency + Interval */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as Frequency)}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {frequency.charAt(0).toUpperCase() + frequency.slice(1)}
                  </SelectValue>
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
            <div className="space-y-1.5">
              <Label>Interval</Label>
              <Input
                type="number"
                min="1"
                step="1"
                required
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
                className="font-numeric"
                aria-label="Interval"
              />
            </div>
          </div>

          {/* Next occurrence */}
          <DateField
            label="Next occurrence"
            value={nextOccurrence}
            onChange={setNextOccurrence}
            required
          />

          {/* Status */}
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={active} onValueChange={(v) => { if (v) setActive(v) }}>
              <SelectTrigger className="w-full">
                <SelectValue>{active === "true" ? "Active" : "Paused"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Active</SelectItem>
                <SelectItem value="false">Paused</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Preview line */}
          <div
            className={cn(
              "flex items-center justify-between rounded-lg px-3.5 py-2.5",
              income ? "bg-moss/10" : "bg-clay/10",
            )}
          >
            <span className="text-sm text-muted-foreground">
              Recurs <span className="font-medium text-foreground">{freq}</span> · next{" "}
              {nextOccurrence}
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
              {isEditing ? "Save" : "Add template"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}