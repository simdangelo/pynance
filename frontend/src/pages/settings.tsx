import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Landmark, MessageCircle } from "lucide-react"

import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import type { LinkCodeResponse } from "@/types/api"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
      toast.success("Asset predefinito aggiornato")
    },
    onError: () => {
      toast.error("Impossibile aggiornare l'asset predefinito")
    },
  })

  const generate = useMutation({
    mutationFn: api.telegram.createLinkCode,
    onSuccess: (data) => {
      setLinkCode(data)
      toast.success("Codice generato")
    },
    onError: () => {
      toast.error("Impossibile generare il codice")
    },
  })

  const revoke = useMutation({
    mutationFn: api.telegram.revokeLinkCodes,
    onSuccess: () => {
      setLinkCode(null)
      toast.success("Codice revocato")
    },
    onError: () => {
      toast.error("Impossibile revocare il codice")
    },
  })

  const selectedAsset = liquidAssets.find(
    (asset) => asset.id === user?.default_asset_id,
  )

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" subtitle="Account e preferenze." />

      <Card>
        <CardHeader>
          <CardTitle>Generale</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Nulla da mostrare qui per ora.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Landmark className="h-4 w-4" />
            Asset predefinito
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Dove finiscono le registrazioni rapide: le spese dal bot Telegram e i
            template ricorrenti. È obbligatorio sceglierne uno.
          </p>
          {liquidAssets.length === 0 ? (
            <div className="rounded-lg border border-clay/30 bg-clay/10 px-3.5 py-2.5 text-sm text-clay">
              Non hai ancora asset liquidi. Creane uno in Assets, poi scegli qui
              l'asset predefinito.
            </div>
          ) : (
            <div className="max-w-sm">
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
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {selectedAsset?.name ?? "Seleziona un asset"}
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
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            Bot Telegram
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Collega la tua chat Telegram per registrare le spese dal telefono, senza
            aprire l'app.{" "}
            {botInfo?.bot_username ? (
              <>
                Il bot di questa installazione è{" "}
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
              "Il bot è quello configurato per questa installazione (nome non disponibile)."
            )}
          </p>

          {!user?.default_asset_id && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-clay/30 bg-clay/10 px-4 py-3 text-sm text-clay">
              <span>
                Scegli un asset predefinito (card "Asset predefinito" qui sopra):
                senza, il bot non può registrare spese.
              </span>
            </div>
          )}

          <div className="space-y-1.5 rounded-lg border border-border bg-muted/50 p-4 text-sm">
            <p>
              1. Genera un codice qui sotto. 2. Apri la chat del bot e invia{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">/link &lt;codice&gt;</code>.
            </p>
            <p className="text-muted-foreground">
              Il codice dura {linkCode?.expires_in_minutes ?? 10} minuti, è monouso e non va
              condiviso: chi lo invia per primo collega la propria chat al tuo account.
            </p>
            <p className="text-muted-foreground">
              Generare un nuovo codice annulla il precedente; "Revoca" lo annulla subito.
            </p>
            <p className="text-muted-foreground">
              Una volta collegata, la chat resta collegata finché non invii{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">/unlink</code>.
            </p>
            <p className="text-muted-foreground">
              Comandi utili:{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">/balance</code> per il
              saldo, <code className="rounded bg-muted px-1 py-0.5 text-xs">/unlink</code> per
              scollegare.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => generate.mutate()}
              disabled={generate.isPending || !user?.default_asset_id}
            >
              {generate.isPending ? "Generazione…" : "Genera codice"}
            </Button>
            <Button
              variant="outline"
              onClick={() => revoke.mutate()}
              disabled={revoke.isPending || !user?.default_asset_id}
            >
              {revoke.isPending ? "Revoca…" : "Revoca codice"}
            </Button>
            {linkCode && (
              <code className="rounded-md bg-muted px-3 py-1.5 text-sm font-medium">
                {linkCode.code}
              </code>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
