import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Landmark, Layers } from "lucide-react"

import { api } from "@/lib/api"
import type { Asset, AssetClass } from "@/types/api"
import {
  ASSET_CLASSES,
  ASSET_CLASS_LABEL,
  LIQUIDITY_COLOR,
  LIQUIDITY_LABEL,
} from "@/lib/asset-meta"
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
  defaultBucketId?: number
}

export function AssetDialog({
  open,
  onOpenChange,
  asset,
  defaultBucketId,
}: AssetDialogProps) {
  const queryClient = useQueryClient()
  const isEditing = Boolean(asset)

  const { data: buckets } = useQuery({
    queryKey: ["buckets"],
    queryFn: api.buckets.list,
  })

  const [name, setName] = useState("")
  const [assetClass, setAssetClass] = useState<AssetClass>("current_account")
  const [bucketId, setBucketId] = useState("")
  const [openingBalance, setOpeningBalance] = useState("")

  useEffect(() => {
    if (open) {
      setName(asset?.name ?? "")
      setAssetClass(asset?.asset_class ?? "current_account")
      setBucketId(
        asset
          ? String(asset.bucket_id)
          : defaultBucketId
            ? String(defaultBucketId)
            : "",
      )
      setOpeningBalance(asset?.opening_balance ?? "0")
    }
  }, [open, asset, defaultBucketId])

  // A new asset defaults to the first bucket, once buckets are loaded.
  useEffect(() => {
    if (open && !asset && !bucketId && buckets && buckets.length > 0) {
      setBucketId(String(buckets[0].id))
    }
  }, [open, asset, bucketId, buckets])

  const selectedBucket = buckets?.find((bucket) => String(bucket.id) === bucketId)

  const mutation = useMutation({
    mutationFn: (data: Parameters<typeof api.assets.create>[0]) =>
      isEditing && asset
        ? api.assets.update(asset.id, data)
        : api.assets.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries()
      onOpenChange(false)
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save asset")
    },
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!bucketId) {
      toast.error("Select a bucket first")
      return
    }
    mutation.mutate({
      name,
      asset_class: assetClass,
      bucket_id: Number(bucketId),
      opening_balance: openingBalance || "0",
    })
  }

  const noBuckets = buckets && buckets.length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit asset" : "Add asset"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the details of this money pool."
              : "Add a money pool (checking, savings, ...) and its starting balance."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Checking"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Asset class</Label>
            <Select
              value={assetClass}
              onValueChange={(v) => v && setAssetClass(v as AssetClass)}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  <span className="flex items-center gap-2">
                    <Landmark className="size-4 text-muted-foreground" />
                    {ASSET_CLASS_LABEL[assetClass]}
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ASSET_CLASSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {ASSET_CLASS_LABEL[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              What the instrument actually is, not what you use it for.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Bucket</Label>
            {noBuckets ? (
              <div className="rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
                No buckets yet. Create one in the Assets page first.
              </div>
            ) : (
              <Select value={bucketId} onValueChange={(v) => v && setBucketId(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {selectedBucket ? (
                      <span className="flex items-center gap-2">
                        <Layers className="size-4 text-muted-foreground" />
                        {selectedBucket.name}
                        <span className="text-xs text-muted-foreground">
                          · {LIQUIDITY_LABEL[selectedBucket.liquidity_category]}
                        </span>
                      </span>
                    ) : (
                      "Select a bucket"
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {buckets?.map((bucket) => (
                    <SelectItem key={bucket.id} value={String(bucket.id)}>
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2 rounded-full"
                          style={{
                            backgroundColor: LIQUIDITY_COLOR[bucket.liquidity_category],
                          }}
                        />
                        {bucket.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="text-xs text-muted-foreground">
              What this money is for; it decides the liquidity split.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Opening balance</Label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-numeric text-lg font-medium">
                €&nbsp;
              </span>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                placeholder="0.00"
                className="h-10 pl-9 font-numeric text-lg"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              The balance this pool had when you started tracking.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending || Boolean(noBuckets)}>
              {isEditing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
