import { useEffect, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Trash2 } from "lucide-react"

import { api } from "@/lib/api"
import type { Bucket } from "@/types/api"
import { LIQUIDITY_COLOR } from "@/lib/asset-meta"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface BucketDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bucket: Bucket | null
  buckets: Bucket[]
  assetCount: number
}

export function BucketDeleteDialog({
  open,
  onOpenChange,
  bucket,
  buckets,
  assetCount,
}: BucketDeleteDialogProps) {
  const queryClient = useQueryClient()
  const [reassignTo, setReassignTo] = useState("")

  useEffect(() => {
    if (open) setReassignTo("")
  }, [open])

  const targets = buckets.filter((candidate) => candidate.id !== bucket?.id)
  const needsReassign = assetCount > 0

  const mutation = useMutation({
    mutationFn: () =>
      api.buckets.remove(bucket!.id, reassignTo ? Number(reassignTo) : undefined),
    onSuccess: () => {
      queryClient.invalidateQueries()
      onOpenChange(false)
    },
    onError: (error: Error) => toast.error(error.message || "Failed to delete bucket"),
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (needsReassign && !reassignTo) return
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <div className="flex flex-col items-center gap-4 pt-2 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-destructive-soft text-destructive">
            <Trash2 className="size-5" />
          </div>
          <DialogHeader className="items-center">
            <DialogTitle>Delete bucket?</DialogTitle>
            <DialogDescription className="text-center">
              {needsReassign
                ? `"${bucket?.name}" still holds ${assetCount} asset${
                    assetCount === 1 ? "" : "s"
                  }. Choose where to move them.`
                : `"${bucket?.name}" will be permanently removed.`}
            </DialogDescription>
          </DialogHeader>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {needsReassign &&
            (targets.length === 0 ? (
              <div className="rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
                No other bucket to move the assets to. Create one first.
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Move assets to</Label>
                <Select
                  value={reassignTo}
                  onValueChange={(v) => v && setReassignTo(v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {targets.find((t) => String(t.id) === reassignTo)?.name ??
                        "Select a bucket"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {targets.map((target) => (
                      <SelectItem key={target.id} value={String(target.id)}>
                        <span className="flex items-center gap-2">
                          <span
                            className="size-2 rounded-full"
                            style={{
                              backgroundColor: LIQUIDITY_COLOR[target.liquidity_category],
                            }}
                          />
                          {target.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={
                mutation.isPending ||
                (needsReassign && (!reassignTo || targets.length === 0))
              }
            >
              Delete
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
