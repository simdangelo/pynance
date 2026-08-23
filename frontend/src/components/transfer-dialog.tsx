import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { api } from "@/lib/api"
import { todayLocalISO } from "@/lib/utils"
import type { Transfer } from "@/types/api"
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

interface TransferDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transfer?: Transfer | null
}

export function TransferDialog({ open, onOpenChange, transfer }: TransferDialogProps) {
  const queryClient = useQueryClient()
  const isEditing = Boolean(transfer)

  const [sourceAssetId, setSourceAssetId] = useState("")
  const [destinationAssetId, setDestinationAssetId] = useState("")
  const [amount, setAmount] = useState("")
  const [description, setDescription] = useState("")
  const [occurredOn, setOccurredOn] = useState("")

  const { data: assets } = useQuery({
    queryKey: ["assets"],
    queryFn: api.assets.list,
  })

  useEffect(() => {
    if (open) {
      setSourceAssetId(transfer ? String(transfer.source_asset_id) : "")
      setDestinationAssetId(transfer ? String(transfer.destination_asset_id) : "")
      setAmount(transfer?.amount ?? "")
      setDescription(transfer?.description ?? "")
      setOccurredOn(transfer?.occurred_on ?? todayLocalISO())
    }
  }, [open, transfer])

  const sourceAsset = useMemo(
    () => assets?.find((a) => String(a.id) === sourceAssetId),
    [assets, sourceAssetId],
  )
  const destinationAsset = useMemo(
    () => assets?.find((a) => String(a.id) === destinationAssetId),
    [assets, destinationAssetId],
  )

  const mutation = useMutation({
    mutationFn: (data: Parameters<typeof api.transfers.create>[0]) =>
      isEditing && transfer
        ? api.transfers.update(transfer.id, data)
        : api.transfers.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transfers"] })
      queryClient.invalidateQueries({ queryKey: ["assets"] })
      onOpenChange(false)
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save transfer")
    },
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!sourceAsset || !destinationAsset) return
    mutation.mutate({
      source_asset_id: Number(sourceAssetId),
      destination_asset_id: Number(destinationAssetId),
      amount,
      description,
      occurred_on: occurredOn,
    })
  }

  const assetItems = (excludeId?: string) =>
    assets
      ?.filter((a) => String(a.id) !== excludeId)
      .map((a) => (
        <SelectItem key={a.id} value={String(a.id)}>
          {a.name}
        </SelectItem>
      ))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit transfer" : "Add transfer"}</DialogTitle>
          <DialogDescription>
            Move money from one asset to another. This is not income or expense.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>From</Label>
            <Select
              value={sourceAssetId}
              onValueChange={(v) => {
                if (v) {
                  setSourceAssetId(v)
                  if (v === destinationAssetId) setDestinationAssetId("")
                }
              }}
              required
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue>{sourceAsset?.name ?? "Select source asset"}</SelectValue>
              </SelectTrigger>
              <SelectContent className="min-w-[240px]">
                {assetItems(destinationAssetId)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>To</Label>
            <Select
              value={destinationAssetId}
              onValueChange={(v) => {
                if (v) {
                  setDestinationAssetId(v)
                  if (v === sourceAssetId) setSourceAssetId("")
                }
              }}
              required
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue>
                  {destinationAsset?.name ?? "Select destination asset"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="min-w-[240px]">
                {assetItems(sourceAssetId)}
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
              placeholder="e.g. monthly savings"
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