import { Fragment, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Scale, Trash2 } from "lucide-react"

import { api } from "@/lib/api"
import type { BalanceAdjustment } from "@/types/api"
import { LIQUIDITY_CATEGORIES, LIQUIDITY_COLOR, LIQUIDITY_LABEL } from "@/lib/asset-meta"
import { todayLocalISO } from "@/lib/utils"
import { Money } from "@/components/money"
import { DateField } from "@/components/date-field"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { RowActions } from "@/components/row-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export function ReconcilePanel() {
  const queryClient = useQueryClient()
  const [declared, setDeclared] = useState<Record<number, string>>({})
  const [occurredOn, setOccurredOn] = useState(todayLocalISO())
  const [note, setNote] = useState(`Reconciliation ${todayLocalISO()}`)
  const [deleteTarget, setDeleteTarget] = useState<BalanceAdjustment | null>(null)

  const { data: assets, isLoading, isError } = useQuery({
    queryKey: ["assets"],
    queryFn: api.assets.list,
  })
  const { data: buckets } = useQuery({
    queryKey: ["buckets"],
    queryFn: api.buckets.list,
  })
  const { data: adjustments } = useQuery({
    queryKey: ["adjustments"],
    queryFn: () => api.adjustments.list(),
  })

  const bucketById = useMemo(
    () => new Map((buckets ?? []).map((bucket) => [bucket.id, bucket])),
    [buckets],
  )

  const orderedAssets = useMemo(() => {
    const order = new Map((buckets ?? []).map((bucket, index) => [bucket.id, index]))
    return [...(assets ?? [])].sort((a, b) => {
      const byBucket = (order.get(a.bucket_id) ?? 0) - (order.get(b.bucket_id) ?? 0)
      return byBucket !== 0 ? byBucket : a.name.localeCompare(b.name)
    })
  }, [assets, buckets])

  const declaredValue = (assetId: number): number | null => {
    const raw = (declared[assetId] ?? "").trim()
    if (raw === "") return null
    const value = Number(raw)
    return Number.isFinite(value) ? value : null
  }

  const filledAssets = orderedAssets.filter((asset) => declaredValue(asset.id) !== null)

  const difference =
    filledAssets.reduce((sum, asset) => sum + (declaredValue(asset.id) ?? 0), 0) -
    filledAssets.reduce((sum, asset) => sum + Number(asset.balance), 0)

  const groups = LIQUIDITY_CATEGORIES.map((category) => {
    const groupAssets = orderedAssets.filter(
      (asset) => bucketById.get(asset.bucket_id)?.liquidity_category === category,
    )
    const filled = groupAssets.filter((asset) => declaredValue(asset.id) !== null)
    const groupApp = groupAssets.reduce((sum, asset) => sum + Number(asset.balance), 0)
    const groupActual = filled.reduce(
      (sum, asset) => sum + (declaredValue(asset.id) ?? 0),
      0,
    )
    const groupAppFilled = filled.reduce((sum, asset) => sum + Number(asset.balance), 0)
    return {
      category,
      assets: groupAssets,
      app: groupApp,
      difference: groupActual - groupAppFilled,
      filledCount: filled.length,
    }
  }).filter((group) => group.assets.length > 0)

  const reconcileMutation = useMutation({
    mutationFn: () =>
      api.adjustments.reconcile({
        occurred_on: occurredOn,
        note: note.trim() === "" ? null : note.trim(),
        rows: filledAssets.map((asset) => ({
          asset_id: asset.id,
          declared_balance: String(declaredValue(asset.id)),
        })),
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries()
      const count = result.adjustments.length
      toast.success(
        count === 0
          ? "Balances already aligned"
          : `${count} adjustment${count === 1 ? "" : "s"} created`,
      )
      setDeclared({})
    },
    onError: (error: Error) => toast.error(error.message || "Reconciliation failed"),
  })

  const deleteMutation = useMutation({
    mutationFn: api.adjustments.remove,
    onSuccess: () => {
      queryClient.invalidateQueries()
      toast.success("Adjustment removed")
    },
    onError: (error: Error) => toast.error(error.message || "Failed to remove adjustment"),
  })

  if (isLoading) {
    return <p className="py-6 text-sm text-muted-foreground">Loading…</p>
  }
  if (isError) {
    return <p className="py-6 text-sm text-destructive">Failed to load assets.</p>
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="size-4" />
            Reconcile balances
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Type the real balance of each account as you read it from the bank. The app
            creates a signed adjustment for the difference, dated below.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {orderedAssets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No assets yet. Add one in the Accounts tab first.
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset</TableHead>
                    <TableHead>Bucket</TableHead>
                    <TableHead className="text-right">App balance</TableHead>
                    <TableHead className="w-[160px] text-right">Actual balance</TableHead>
                    <TableHead className="w-[120px] text-right">Difference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.map((group) => (
                    <Fragment key={group.category}>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableCell colSpan={5} className="py-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="flex items-center gap-2 text-xs font-semibold tracking-[0.06em] uppercase">
                              <span
                                className="size-2 rounded-full"
                                style={{ backgroundColor: LIQUIDITY_COLOR[group.category] }}
                              />
                              {LIQUIDITY_LABEL[group.category]}
                              <span className="font-normal text-muted-foreground">
                                ({group.assets.length})
                              </span>
                            </span>
                            <span className="flex items-center gap-4 text-xs text-muted-foreground">
                              <Money value={group.app.toFixed(2)} />
                              {group.filledCount > 0 && (
                                <span className="flex items-center gap-1">
                                  Difference
                                  <Money
                                    value={group.difference.toFixed(2)}
                                    signed
                                    className={
                                      group.difference === 0
                                        ? "text-muted-foreground"
                                        : group.difference > 0
                                          ? "text-moss"
                                          : "text-clay"
                                    }
                                  />
                                </span>
                              )}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                      {group.assets.map((asset) => {
                        const bucket = bucketById.get(asset.bucket_id)
                        const value = declaredValue(asset.id)
                        const delta = value === null ? null : value - Number(asset.balance)
                        return (
                          <TableRow key={asset.id}>
                            <TableCell className="font-medium">{asset.name}</TableCell>
                            <TableCell>
                              <span className="text-sm text-muted-foreground">
                                {bucket?.name ?? "—"}
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-numeric">
                              <Money value={asset.balance} />
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                step="0.01"
                                value={declared[asset.id] ?? ""}
                                onChange={(e) =>
                                  setDeclared((previous) => ({
                                    ...previous,
                                    [asset.id]: e.target.value,
                                  }))
                                }
                                placeholder="—"
                                className="h-8 text-right font-numeric"
                              />
                            </TableCell>
                            <TableCell className="text-right font-numeric">
                              {delta === null ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                <Money
                                  value={delta.toFixed(2)}
                                  signed
                                  className={
                                    delta === 0
                                      ? "text-muted-foreground"
                                      : delta > 0
                                        ? "text-moss"
                                        : "text-clay"
                                  }
                                />
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-4 py-3 text-sm">
                <span className="text-muted-foreground">
                  Difference ({filledAssets.length} of {orderedAssets.length} accounts
                  filled)
                </span>
                <Money
                  value={difference.toFixed(2)}
                  signed
                  className={
                    difference === 0
                      ? "font-medium text-muted-foreground"
                      : difference > 0
                        ? "font-medium text-moss"
                        : "font-medium text-clay"
                  }
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <DateField label="Adjustment date" value={occurredOn} onChange={setOccurredOn} />
                <div className="space-y-1.5">
                  <Label>Note</Label>
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. Year-end reconciliation"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={() => reconcileMutation.mutate()}
                  disabled={reconcileMutation.isPending || filledAssets.length === 0}
                >
                  {reconcileMutation.isPending ? "Reconciling…" : "Create adjustments"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Adjustment history</CardTitle>
        </CardHeader>
        <CardContent>
          {!adjustments || adjustments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No adjustments yet.</p>
          ) : (
            <div className="space-y-1">
              {adjustments.map((adjustment) => (
                <div
                  key={adjustment.id}
                  className="flex items-center justify-between gap-3 py-1.5"
                >
                  <span className="flex min-w-0 items-center gap-2 text-sm">
                    <span className="font-numeric text-muted-foreground">
                      {adjustment.occurred_on}
                    </span>
                    <span className="font-medium">
                      {assets?.find((asset) => asset.id === adjustment.asset_id)?.name ??
                        "Unknown asset"}
                    </span>
                    {adjustment.note && (
                      <span className="truncate text-muted-foreground">
                        · {adjustment.note}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-3">
                    <Money
                      value={adjustment.amount}
                      signed
                      className={
                        Number(adjustment.amount) >= 0 ? "text-moss" : "text-clay"
                      }
                    />
                    <RowActions label="Actions for this adjustment">
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setDeleteTarget(adjustment)}
                      >
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </RowActions>
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete adjustment?"
        description={
          deleteTarget
            ? `The ${deleteTarget.amount} adjustment of ${deleteTarget.occurred_on} will be removed and the asset balance will change back.`
            : undefined
        }
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  )
}
