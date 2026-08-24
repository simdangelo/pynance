import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Landmark } from "lucide-react"

import { api } from "@/lib/api"
import { todayLocalISO } from "@/lib/utils"
import type { Transfer } from "@/types/api"
import { Money } from "@/components/money"
import { DateField } from "@/components/date-field"
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
      queryClient.invalidateQueries()
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
          <span className="flex items-center gap-2">
            <Landmark className="size-4 text-muted-foreground" />
            {a.name}
          </span>
        </SelectItem>
      ))

  const canTransfer = (assets?.length ?? 0) >= 2

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit transfer" : "Add transfer"}</DialogTitle>
          <DialogDescription>
            Move money from one asset to another.
          </DialogDescription>
        </DialogHeader>
        {!assets ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !canTransfer ? (
          <p className="text-sm text-muted-foreground">
            Transfers need at least two assets. Add another asset first.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
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
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {sourceAsset ? (
                      <span className="flex items-center gap-2">
                        <Landmark className="size-4 text-muted-foreground" />
                        {sourceAsset.name}
                      </span>
                    ) : (
                      "Select source asset"
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {assetItems(destinationAssetId)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
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
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {destinationAsset ? (
                      <span className="flex items-center gap-2">
                        <Landmark className="size-4 text-muted-foreground" />
                        {destinationAsset.name}
                      </span>
                    ) : (
                      "Select destination asset"
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {assetItems(sourceAssetId)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Amount</Label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-numeric text-lg font-medium">
                  €&nbsp;
                </span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="h-10 pl-9 font-numeric text-lg"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. monthly savings"
              />
            </div>

            <DateField
              label="Date"
              value={occurredOn}
              onChange={setOccurredOn}
              required
            />

            {/* Preview line */}
            <div className="flex items-center justify-between rounded-lg bg-secondary px-3.5 py-2.5">
              <span className="text-sm text-muted-foreground">
                {sourceAsset && destinationAsset ? (
                  <>
                    Move from{" "}
                    <span className="font-medium text-foreground">{sourceAsset.name}</span>{" "}
                    to{" "}
                    <span className="font-medium text-foreground">
                      {destinationAsset.name}
                    </span>
                  </>
                ) : (
                  "Move between assets"
                )}
              </span>
              <Money value={amount || "0"} className="font-medium" />
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
        )}
      </DialogContent>
    </Dialog>
  )
}