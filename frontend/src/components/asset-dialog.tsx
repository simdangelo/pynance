import { useEffect, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { api } from "@/lib/api"
import type { Asset, AssetType } from "@/types/api"
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

interface AssetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  asset?: Asset | null
}

const ASSET_TYPES: AssetType[] = ["liquid", "savings", "etf"]

export function AssetDialog({ open, onOpenChange, asset }: AssetDialogProps) {
  const queryClient = useQueryClient()
  const isEditing = Boolean(asset)

  const [name, setName] = useState("")
  const [assetType, setAssetType] = useState<AssetType>("liquid")
  const [openingBalance, setOpeningBalance] = useState("")

  useEffect(() => {
    if (open) {
      setName(asset?.name ?? "")
      setAssetType(asset?.asset_type ?? "liquid")
      setOpeningBalance(asset?.opening_balance ?? "0")
    }
  }, [open, asset])

  const mutation = useMutation({
    mutationFn: (data: Parameters<typeof api.assets.create>[0]) =>
      isEditing && asset
        ? api.assets.update(asset.id, data)
        : api.assets.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] })
      onOpenChange(false)
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save asset")
    },
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate({
      name,
      asset_type: assetType,
      opening_balance: openingBalance || "0",
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit asset" : "Add asset"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the details of this money pool."
              : "Add a money pool (checking, savings, ...) and its starting balance."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Checking"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Type</Label>
            <Select value={assetType} onValueChange={(v) => v && setAssetType(v as AssetType)}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSET_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Opening balance</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              placeholder="0.00"
              className="mt-1.5 font-numeric"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              The balance this pool had when you started tracking.
            </p>
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