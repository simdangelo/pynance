import { useEffect, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { api } from "@/lib/api"
import type { Bucket, LiquidityCategory } from "@/types/api"
import { LIQUIDITY_CATEGORIES, LIQUIDITY_COLOR, LIQUIDITY_LABEL } from "@/lib/asset-meta"
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

interface BucketDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bucket?: Bucket | null
  defaultLiquidityCategory?: LiquidityCategory
}

export function BucketDialog({
  open,
  onOpenChange,
  bucket,
  defaultLiquidityCategory,
}: BucketDialogProps) {
  const queryClient = useQueryClient()
  const isEditing = Boolean(bucket)

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [liquidityCategory, setLiquidityCategory] =
    useState<LiquidityCategory>("liquid")

  useEffect(() => {
    if (open) {
      setName(bucket?.name ?? "")
      setDescription(bucket?.description ?? "")
      setLiquidityCategory(
        bucket?.liquidity_category ?? defaultLiquidityCategory ?? "liquid",
      )
    }
  }, [open, bucket, defaultLiquidityCategory])

  const mutation = useMutation({
    mutationFn: (data: Parameters<typeof api.buckets.create>[0]) =>
      isEditing && bucket
        ? api.buckets.update(bucket.id, data)
        : api.buckets.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries()
      onOpenChange(false)
    },
    onError: (error: Error) => toast.error(error.message || "Failed to save bucket"),
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate({
      name,
      description: description || null,
      liquidity_category: liquidityCategory,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit bucket" : "Add bucket"}</DialogTitle>
          <DialogDescription>
            A bucket is what the money is for (emergency fund, investments, ...).
            Its liquidity category drives the liquid / reserve / invested split.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. House down payment"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Liquidity category</Label>
            <Select
              value={liquidityCategory}
              onValueChange={(v) => v && setLiquidityCategory(v as LiquidityCategory)}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  <span className="flex items-center gap-2">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: LIQUIDITY_COLOR[liquidityCategory] }}
                    />
                    {LIQUIDITY_LABEL[liquidityCategory]}
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {LIQUIDITY_CATEGORIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: LIQUIDITY_COLOR[value] }}
                      />
                      {LIQUIDITY_LABEL[value]}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
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
