import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import type { LinkCodeResponse } from "@/types/api"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export default function Settings() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [linkCode, setLinkCode] = useState<LinkCodeResponse | null>(null)

  const { data: assets } = useQuery({
    queryKey: ["assets"],
    queryFn: api.assets.list,
  })
  const liquidAssets = (assets ?? []).filter(
    (asset) => asset.liquidity_category === "liquid",
  )

  const { data: botInfo } = useQuery({
    queryKey: ["telegram-bot"],
    queryFn: api.telegram.botInfo,
  })

  const updateDefault = useMutation({
    mutationFn: (assetId: number | null) => api.auth.updateMe({ default_asset_id: assetId }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["me"], updated)
      toast.success("Default asset updated")
    },
    onError: () => {
      toast.error("Could not update the default asset")
    },
  })

  const generate = useMutation({
    mutationFn: api.telegram.createLinkCode,
    onSuccess: (data) => {
      setLinkCode(data)
      toast.success("Code generated")
    },
    onError: () => {
      toast.error("Could not generate the code")
    },
  })

  const revoke = useMutation({
    mutationFn: api.telegram.revokeLinkCodes,
    onSuccess: () => {
      setLinkCode(null)
      toast.success("Code revoked")
    },
    onError: () => {
      toast.error("Could not revoke the code")
    },
  })

  const selectedAsset = liquidAssets.find(
    (asset) => asset.id === user?.default_asset_id,
  )

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" subtitle="Account and preferences." />

      <section className="space-y-2">
        <h2 className="text-[13.5px] font-semibold">General</h2>
        <Card className="py-0">
          <CardContent className="divide-y divide-border p-0">
            <div className="flex flex-wrap items-start justify-between gap-4 p-5">
              <div className="min-w-0 space-y-0.5">
                <p className="text-[13.5px] font-semibold">Default asset</p>
                <p className="max-w-prose text-[13px] text-muted-foreground">
                  Where quick entries land: Telegram bot expenses and recurring
                  templates. One is required.
                </p>
              </div>
              {liquidAssets.length === 0 ? (
                <p className="rounded-[10px] border border-dashed border-input bg-background px-3 py-2 text-[13px] text-muted-foreground">
                  No liquid assets yet. Create one in Assets first.
                </p>
              ) : (
                <Select
                  value={
                    user?.default_asset_id ? String(user.default_asset_id) : ""
                  }
                  onValueChange={(value) => {
                    if (!value) return
                    updateDefault.mutate(Number(value))
                  }}
                  disabled={updateDefault.isPending}
                >
                  <SelectTrigger className="w-[220px]">
                    <SelectValue>
                      {selectedAsset?.name ?? "Select an asset"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {liquidAssets.map((asset) => (
                      <SelectItem key={asset.id} value={String(asset.id)}>
                        {asset.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="text-[13.5px] font-semibold">Telegram</h2>
        <Card className="py-0">
          <CardContent className="divide-y divide-border p-0">
            <div className="flex flex-wrap items-start justify-between gap-4 p-5">
              <div className="min-w-0 space-y-0.5">
                <p className="text-[13.5px] font-semibold">Bot chat</p>
                <p className="max-w-prose text-[13px] text-muted-foreground">
                  Link your Telegram chat to record expenses from your phone,
                  without opening the app.{" "}
                  {botInfo?.bot_username ? (
                    <>
                      This installation&apos;s bot is{" "}
                      <a
                        href={`https://t.me/${botInfo.bot_username}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-foreground underline underline-offset-2"
                      >
                        @{botInfo.bot_username}
                      </a>
                      .
                    </>
                  ) : (
                    "The bot is the one configured for this installation (name unavailable)."
                  )}
                </p>
              </div>
              {!user?.default_asset_id && (
                <p className="rounded-[10px] border border-dashed border-input bg-background px-3 py-2 text-[13px] text-muted-foreground">
                  Choose a default asset first: without one the bot can&apos;t
                  record expenses.
                </p>
              )}
            </div>

            <div className="space-y-1.5 p-5 text-[13px]">
              <p>
                1. Generate a code below. 2. Open the bot chat and send{" "}
                <code className="rounded-[4px] border border-border bg-muted px-1 py-0.5 font-mono text-xs">
                  /link &lt;code&gt;
                </code>
                .
              </p>
              <p className="text-muted-foreground">
                The code lasts {linkCode?.expires_in_minutes ?? 10} minutes, is
                single-use and must not be shared: whoever sends it first links
                their chat to your account.
              </p>
              <p className="text-muted-foreground">
                Generating a new code cancels the previous one; &quot;Revoke&quot;
                cancels it immediately.
              </p>
              <p className="text-muted-foreground">
                Once linked, the chat stays linked until you send{" "}
                <code className="rounded-[4px] border border-border bg-muted px-1 py-0.5 font-mono text-xs">
                  /unlink
                </code>
                .
              </p>
              <p className="text-muted-foreground">
                Useful commands:{" "}
                <code className="rounded-[4px] border border-border bg-muted px-1 py-0.5 font-mono text-xs">
                  /balance
                </code>{" "}
                for the balance,{" "}
                <code className="rounded-[4px] border border-border bg-muted px-1 py-0.5 font-mono text-xs">
                  /unlink
                </code>{" "}
                to disconnect.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 p-5">
              <Button
                onClick={() => generate.mutate()}
                disabled={generate.isPending || !user?.default_asset_id}
              >
                {generate.isPending ? "Generating…" : "Generate code"}
              </Button>
              <Button
                variant="outline"
                onClick={() => revoke.mutate()}
                disabled={revoke.isPending || !user?.default_asset_id}
              >
                {revoke.isPending ? "Revoking…" : "Revoke code"}
              </Button>
              {linkCode && (
                <code className="rounded-[6px] border border-border bg-muted px-3 py-1.5 font-mono text-[13px] font-medium">
                  {linkCode.code}
                </code>
              )}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
