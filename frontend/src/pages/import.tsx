import { useRef, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { FileUp } from "lucide-react"

import { api } from "@/lib/api"
import type { ImportPreviewRow, ImportResult } from "@/types/api"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default function ImportData() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreviewRow[] | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)

  const previewMutation = useMutation({
    mutationFn: api.importData.preview,
    onSuccess: (data) => {
      setPreview(data.rows)
      setResult(null)
    },
    onError: (error: Error) => {
      toast.error(error.message || "Could not read file")
      setPreview(null)
    },
  })

  const importMutation = useMutation({
    mutationFn: api.importData.upload,
    onSuccess: (data) => {
      setResult(data)
      setPreview(null)
      toast.success("Import complete")
      if (fileInputRef.current) fileInputRef.current.value = ""
      setFile(null)
    },
    onError: (error: Error) => {
      toast.error(error.message || "Import failed")
    },
  })

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null
    setFile(selected)
    setResult(null)
    if (selected) {
      setPreview(null)
      previewMutation.mutate(selected)
    } else {
      setPreview(null)
    }
  }

  const submit = () => {
    if (file) {
      importMutation.mutate(file)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import"
        subtitle="Import transactions from a CSV or Excel file."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload a file</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx"
              className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-secondary file:px-4 file:py-2 file:text-sm file:font-medium"
              onChange={onFileChange}
            />
            <div className="flex items-center gap-3">
              <Button
                type="button"
                onClick={submit}
                disabled={!file || previewMutation.isPending || importMutation.isPending}
              >
                <FileUp className="mr-1 h-4 w-4" />
                {importMutation.isPending ? "Importing…" : "Import"}
              </Button>
              {file && (
                <span className="text-sm text-muted-foreground">{file.name}</span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Expected columns: <code>Details, Date, Type, Category, Amount (EUR)</code>.
              Type is <code>Income</code> or <code>Expenditure</code>.
            </p>
          </div>
        </CardContent>
      </Card>

      {previewMutation.isPending && (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">Parsing file…</p>
          </CardContent>
        </Card>
      )}

      {preview && preview.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview — first {preview.length} rows</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-numeric text-sm">{row.occurred_on}</TableCell>
                    <TableCell>{row.description}</TableCell>
                    <TableCell>{row.category}</TableCell>
                    <TableCell>{row.transaction_type}</TableCell>
                    <TableCell className="text-right font-numeric">{row.amount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {preview && preview.length === 0 && (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">No rows were parsed from this file.</p>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardContent>
            <div className="rounded-lg border border-border bg-muted/50 p-4 text-sm">
              <p className="font-medium">Import summary</p>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                <li>{result.transactions_imported} transactions imported</li>
                <li>{result.categories_created} categories created</li>
                <li>{result.skipped} rows skipped</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}