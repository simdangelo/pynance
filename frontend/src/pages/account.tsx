import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { MessageCircle } from "lucide-react"

import { api } from "@/lib/api"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function Account() {
  const [code, setCode] = useState<string | null>(null)

  const linkCode = useMutation({
    mutationFn: api.telegram.createLinkCode,
    onSuccess: (data) => {
      setCode(data.code)
      toast.success("Codice generato")
    },
    onError: () => {
      toast.error("Impossibile generare il codice")
    },
  })

  return (
    <div className="space-y-6">
      <PageHeader title="Account" subtitle="Impostazioni del tuo account." />

      <Card>
        <CardHeader>
          <CardTitle>Generale</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Nulla da mostrare qui per ora.
          </p>
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
          <p className="text-muted-foreground">
            Collega la tua chat Telegram per registrare spese dal telefono.
            Genera un codice, poi invialo al bot con{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">/link &lt;codice&gt;</code>.
          </p>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => linkCode.mutate()}
              disabled={linkCode.isPending}
            >
              {linkCode.isPending ? "Generazione…" : "Genera codice"}
            </Button>
            {code && (
              <code className="rounded-md bg-muted px-3 py-1.5 text-sm font-medium">
                {code}
              </code>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}