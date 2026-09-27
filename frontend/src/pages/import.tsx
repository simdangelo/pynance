import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { FileUp, Info, Loader2, Undo2, Upload } from "lucide-react"

import { api } from "@/lib/api"
import type {
  Asset,
  ImportCommitResult,
  ImportMapping,
  ImportPreview,
  ImportRow,
} from "@/types/api"
import { PageHeader } from "@/components/page-header"
import { Money } from "@/components/money"
import { TypeBadge } from "@/components/type-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const NONE = "__none__"

const MAPPING_FIELDS: {
  key: keyof ImportMapping
  label: string
  required?: boolean
  hint: string
}[] = [
  {
    key: "date",
    label: "Date",
    required: true,
    hint: "The date the transaction happened.",
  },
  {
    key: "description",
    label: "Description",
    hint: "A short text shown in the transactions list.",
  },
  {
    key: "amount",
    label: "Amount",
    required: true,
    hint: "The amount. A minus sign means money out.",
  },
  {
    key: "type",
    label: "Income/expense column",
    hint: "Optional. A column that says income or expense in words. If your file doesn't have it, the sign of the amount decides.",
  },
  {
    key: "category",
    label: "Category",
    hint: "Optional. A category for each row; you can review and change it per row in step 3.",
  },
]

const DATE_FORMATS = [
  { value: "auto", label: "Auto (day/month/year)" },
  { value: "iso", label: "ISO (yyyy-mm-dd)" },
  { value: "mdy", label: "US (month/day/year)" },
]

const DELIMITERS = [
  { value: "__auto__", label: "Auto" },
  { value: ",", label: "Comma ," },
  { value: ";", label: "Semicolon ;" },
  { value: "\t", label: "Tab" },
  { value: "|", label: "Pipe |" },
]

function preferredAsset(assets: Asset[]): Asset | undefined {
  return assets.find((asset) => asset.liquidity_category === "liquid") ?? assets[0]
}

function ParsingIndicator({ active }: { active: boolean }) {
  return (
    <span
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-opacity ${
        active
          ? "border-border bg-muted text-foreground opacity-100"
          : "invisible opacity-0"
      }`}
    >
      <Loader2 className="size-3.5 animate-spin" />
      Reading the file…
    </span>
  )
}

function InfoHint({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex" tabIndex={0} aria-label={text}>
      <Info className="size-3.5 text-muted-foreground" />
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 w-64 -translate-x-1/2 rounded-md border border-border bg-popover px-2.5 py-2 text-xs leading-relaxed font-normal text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus:opacity-100">
        {text}
      </span>
    </span>
  )
}

export default function ImportData() {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [mapping, setMapping] = useState<ImportMapping | null>(null)
  const [dateFormat, setDateFormat] = useState("auto")
  const [delimiter, setDelimiter] = useState("__auto__")
  const [sheet, setSheet] = useState<string | null>(null)
  const [assetId, setAssetId] = useState("")
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [rowCategoryIds, setRowCategoryIds] = useState<Record<number, number>>({})
  const [result, setResult] = useState<ImportCommitResult | null>(null)

  const { data: assets } = useQuery({ queryKey: ["assets"], queryFn: api.assets.list })
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: api.categories.list,
  })

  const previewMutation = useMutation({
    mutationFn: (config: Parameters<typeof api.importData.preview>[1]) =>
      api.importData.preview(file as File, config),
    onSuccess: (data) => {
      setPreview(data)
      setMapping((previous) => previous ?? data.suggested_mapping)
      setSelected(
        new Set(data.rows.filter((row) => row.status === "ok").map((row) => row.index)),
      )
      setRowCategoryIds({})
    },
    onError: (error: Error) => {
      toast.error(error.message || "Could not read the file")
      setPreview(null)
    },
  })

  const applyPreview = previewMutation.mutate

  const runPreview = useCallback(
    (overrides: {
      mapping?: ImportMapping | null
      dateFormat?: string
      delimiter?: string
      sheet?: string | null
      assetId?: string
    } = {}) => {
      if (!file) return
      const nextAssetId = overrides.assetId ?? assetId
      applyPreview({
        mapping: overrides.mapping ?? mapping,
        dateFormat: overrides.dateFormat ?? dateFormat,
        delimiter:
          (overrides.delimiter ?? delimiter) === "__auto__"
            ? null
            : (overrides.delimiter ?? delimiter),
        sheet: overrides.sheet !== undefined ? overrides.sheet : sheet,
        assetId: nextAssetId ? Number(nextAssetId) : null,
      })
    },
    [applyPreview, assetId, dateFormat, delimiter, file, mapping, sheet],
  )

  useEffect(() => {
    if (assetId || !assets || assets.length === 0) return
    const preferred = preferredAsset(assets)
    if (!preferred) return
    setAssetId(String(preferred.id))
    if (file) runPreview({ assetId: String(preferred.id) })
  }, [assets, assetId, file, runPreview])

  const createCategoryMutation = useMutation({
    mutationFn: (variables: {
      rowIndex: number
      name: string
      direction: "income" | "expense"
    }) =>
      api.categories.create({
        name: variables.name,
        transaction_type: variables.direction,
      }),
    onSuccess: (created, variables) => {
      queryClient.invalidateQueries({ queryKey: ["categories"] })
      setRowCategoryIds((previous) => ({ ...previous, [variables.rowIndex]: created.id }))
      toast.success(`Category "${created.name}" created`)
    },
    onError: (error: Error) => toast.error(error.message || "Could not create the category"),
  })

  const fileValueOf = useCallback(
    (row: ImportRow) => row.category?.trim() ?? "",
    [],
  )

  const exactNameCategory = useCallback(
    (value: string) =>
      (categories ?? []).find(
        (category) => category.name.toLowerCase() === value.toLowerCase(),
      ),
    [categories],
  )

  const defaultCategoryId = useCallback(
    (row: ImportRow): number | undefined => {
      const value = fileValueOf(row)
      if (!value) return undefined
      const match = (categories ?? []).find(
        (category) =>
          category.name.toLowerCase() === value.toLowerCase() &&
          (!row.direction || category.transaction_type === row.direction),
      )
      return match?.id
    },
    [categories, fileValueOf],
  )

  const effectiveCategoryId = useCallback(
    (row: ImportRow): number | undefined =>
      rowCategoryIds[row.index] ?? defaultCategoryId(row),
    [rowCategoryIds, defaultCategoryId],
  )

  const isSelectable = useCallback(
    (row: ImportRow) => row.status !== "invalid" && effectiveCategoryId(row) !== undefined,
    [effectiveCategoryId],
  )

  const selectableIndexes = useMemo(
    () =>
      new Set(
        (preview?.rows ?? []).filter((row) => isSelectable(row)).map((row) => row.index),
      ),
    [preview, isSelectable],
  )

  const effectiveSelected = useMemo(
    () => [...selected].filter((index) => selectableIndexes.has(index)),
    [selected, selectableIndexes],
  )

  const rowsByIndex = useMemo(() => {
    const map = new Map<number, ImportRow>()
    for (const row of preview?.rows ?? []) map.set(row.index, row)
    return map
  }, [preview])

  const unresolvedCount = useMemo(
    () =>
      (preview?.rows ?? []).filter(
        (row) => row.status !== "invalid" && !isSelectable(row),
      ).length,
    [preview, isSelectable],
  )

  const commitMutation = useMutation({
    mutationFn: () =>
      api.importData.commit(file as File, {
        mapping,
        dateFormat,
        delimiter: delimiter === "__auto__" ? null : delimiter,
        sheet,
        assetId: Number(assetId),
        selectedIndexes: effectiveSelected,
        rowCategories: effectiveSelected.map((index) => ({
          index,
          category_id: effectiveCategoryId(rowsByIndex.get(index) as ImportRow) as number,
        })),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries()
      setResult(data)
      setPreview(null)
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ""
    },
    onError: (error: Error) => toast.error(error.message || "Import failed"),
  })

  const undoMutation = useMutation({
    mutationFn: (ids: number[]) => api.transactions.bulkDelete(ids),
    onSuccess: (data) => {
      queryClient.invalidateQueries()
      toast.success(`${data.deleted} transactions removed`)
      setResult(null)
    },
    onError: (error: Error) => toast.error(error.message || "Undo failed"),
  })

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] ?? null
    setFile(selectedFile)
    setPreview(null)
    setResult(null)
    setMapping(null)
    setDateFormat("auto")
    setDelimiter("__auto__")
    setSheet(null)
    setRowCategoryIds({})
    if (selectedFile) {
      applyPreview({
        mapping: null,
        dateFormat: "auto",
        delimiter: null,
        sheet: null,
        assetId: assetId ? Number(assetId) : null,
      })
    }
  }

  const openFilePicker = () => fileInputRef.current?.click()

  const updateMappingField = (key: keyof ImportMapping, value: string) => {
    if (!mapping) return
    const next: ImportMapping = { ...mapping, [key]: value === NONE ? null : value }
    setMapping(next)
    runPreview({ mapping: next })
  }

  const toggleRow = (index: number) => {
    if (!selectableIndexes.has(index)) return
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const summary = preview?.summary
  const showWizard = preview !== null && file !== null && mapping !== null && !result
  const busy = previewMutation.isPending || commitMutation.isPending

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import"
        subtitle="Bring in transactions from any CSV or Excel file: check the columns, choose where they go, pick the rows."
      />

      {!showWizard && !result && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Upload a file</CardTitle>
              <ParsingIndicator active={previewMutation.isPending} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx"
                className="hidden"
                onChange={onFileChange}
              />
              <button
                type="button"
                onClick={openFilePicker}
                disabled={busy}
                className="flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/30 px-6 py-10 text-center transition-colors hover:border-foreground/40 hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="flex size-12 items-center justify-center rounded-full bg-secondary">
                  <Upload className="size-5 text-muted-foreground" />
                </span>
                <span className="text-sm font-medium text-foreground">Choose a file</span>
                <span className="text-xs text-muted-foreground">CSV or Excel (.csv, .xlsx)</span>
              </button>
              <p className="text-sm text-muted-foreground">
                Columns are detected automatically; you can fix them in the next step.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {showWizard && preview && mapping && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">1. Check the columns</CardTitle>
                <ParsingIndicator active={previewMutation.isPending} />
              </div>
              <p className="text-sm text-muted-foreground">
                {file?.name} · {summary?.total ?? 0} rows
                {preview.delimiter ? ` · delimiter "${preview.delimiter}"` : ""}
                {preview.sheets ? ` · sheet "${sheet ?? preview.sheets[0]}"` : ""}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {preview.sheets && (
                  <div className="space-y-1.5">
                    <Label>Sheet</Label>
                    <Select
                      value={sheet ?? preview.sheets[0]}
                      disabled={busy}
                      onValueChange={(value) => {
                        if (!value) return
                        setSheet(value)
                        runPreview({ sheet: value })
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>{sheet ?? preview.sheets[0]}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {preview.sheets.map((name) => (
                          <SelectItem key={name} value={name}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {!preview.sheets && (
                  <div className="space-y-1.5">
                    <Label>Delimiter</Label>
                    <Select
                      value={delimiter}
                      disabled={busy}
                      onValueChange={(value) => {
                        if (!value) return
                        setDelimiter(value)
                        runPreview({ delimiter: value })
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {DELIMITERS.find((item) => item.value === delimiter)?.label}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {DELIMITERS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Date format</Label>
                  <Select
                    value={dateFormat}
                    disabled={busy}
                    onValueChange={(value) => {
                      if (!value) return
                      setDateFormat(value)
                      runPreview({ dateFormat: value })
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {DATE_FORMATS.find((item) => item.value === dateFormat)?.label}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {DATE_FORMATS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {MAPPING_FIELDS.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <span>
                        {field.label}
                        {field.required && <span className="ml-0.5 text-clay">*</span>}
                      </span>
                      <InfoHint text={field.hint} />
                    </Label>
                    <Select
                      value={mapping[field.key] ?? NONE}
                      disabled={busy}
                      onValueChange={(value) => {
                        if (value === null) return
                        updateMappingField(field.key, value)
                      }}
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-required={field.required || undefined}
                      >
                        <SelectValue>{mapping[field.key] ?? "Not mapped"}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Not mapped</SelectItem>
                        {preview.headers.map((header) => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                <span className="text-clay">*</span> required
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">2. Destination</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-w-sm space-y-1.5">
                <Label>Asset</Label>
                <Select
                  value={assetId}
                  disabled={busy}
                  onValueChange={(value) => {
                    if (!value) return
                    setAssetId(value)
                    runPreview({ assetId: value })
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {assets?.find((asset) => String(asset.id) === assetId)?.name ??
                        "Select an asset"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {assets?.map((asset) => (
                      <SelectItem key={asset.id} value={String(asset.id)}>
                        {asset.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Which account these transactions belong to.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">3. Choose the rows and categories</CardTitle>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{summary?.ok ?? 0} ready</span>
                  <span>·</span>
                  <span>{summary?.duplicate ?? 0} duplicates (unchecked)</span>
                  <span>·</span>
                  <span>{summary?.invalid ?? 0} invalid</span>
                  {unresolvedCount > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-clay">{unresolvedCount} without category</span>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => setSelected(new Set(selectableIndexes))}
                >
                  Select all
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => setSelected(new Set())}
                >
                  Select none
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead className="w-[110px]">Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-[260px]">Category</TableHead>
                    <TableHead className="w-[90px]">Type</TableHead>
                    <TableHead className="w-[110px] text-right">Amount</TableHead>
                    <TableHead className="w-[200px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.map((row) => {
                    const selectable = isSelectable(row)
                    const fileValue = fileValueOf(row)
                    const exact = fileValue ? exactNameCategory(fileValue) : undefined
                    const canCreate = Boolean(
                      fileValue &&
                        row.direction &&
                        !exact &&
                        !rowCategoryIds[row.index],
                    )
                    const chosenId = effectiveCategoryId(row)
                    const chosen = (categories ?? []).find((c) => c.id === chosenId)
                    const creatingThis =
                      createCategoryMutation.isPending &&
                      createCategoryMutation.variables?.rowIndex === row.index
                    return (
                      <TableRow key={row.index}>
                        <TableCell>
                          <input
                            type="checkbox"
                            aria-label={`Import row ${row.index + 1}`}
                            disabled={!selectable || busy}
                            checked={effectiveSelected.includes(row.index)}
                            onChange={() => toggleRow(row.index)}
                          />
                        </TableCell>
                        <TableCell className="font-numeric text-sm">
                          {row.date ?? "—"}
                        </TableCell>
                        <TableCell>{row.description ?? "—"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Select
                              value={chosenId ? String(chosenId) : NONE}
                              disabled={busy}
                              onValueChange={(value) => {
                                if (!value || value === NONE) return
                                setRowCategoryIds((previous) => ({
                                  ...previous,
                                  [row.index]: Number(value),
                                }))
                              }}
                            >
                              <SelectTrigger size="sm" className="w-[170px]">
                                <SelectValue>
                                  {chosen?.name ?? (fileValue || "Select a category")}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {fileValue && !exact && (
                                  <SelectGroup>
                                    <SelectLabel>From the file</SelectLabel>
                                    <SelectItem value={`file:${row.index}`} disabled>
                                      {fileValue} · not created yet
                                    </SelectItem>
                                  </SelectGroup>
                                )}
                                {fileValue && !exact && <SelectSeparator />}
                                <SelectGroup>
                                  {fileValue && !exact && (
                                    <SelectLabel>Existing categories</SelectLabel>
                                  )}
                                  {(categories ?? []).map((category) => (
                                    <SelectItem
                                      key={category.id}
                                      value={String(category.id)}
                                      disabled={
                                        Boolean(row.direction) &&
                                        category.transaction_type !== row.direction
                                      }
                                    >
                                      {category.name} · {category.transaction_type}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                            {canCreate && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={creatingThis || busy}
                                onClick={() =>
                                  createCategoryMutation.mutate({
                                    rowIndex: row.index,
                                    name: fileValue,
                                    direction: row.direction as "income" | "expense",
                                  })
                                }
                              >
                                {creatingThis ? "Creating…" : "Create"}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {row.direction ? <TypeBadge type={row.direction} /> : "—"}
                        </TableCell>
                        <TableCell className="text-right font-numeric">
                          {row.amount ? (
                            <Money
                              value={
                                row.direction === "expense" ? `-${row.amount}` : row.amount
                              }
                            />
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.status === "invalid" ? (
                            <span className="text-clay">{row.reason}</span>
                          ) : !selectable ? (
                            <span className="text-clay">Choose a category</span>
                          ) : row.status === "duplicate" ? (
                            <span className="text-muted-foreground">Duplicate</span>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>

              <div className="flex flex-wrap items-center justify-end gap-3">
                <span className="text-sm text-muted-foreground">
                  {effectiveSelected.length} of {summary?.ok ?? 0} ready rows selected
                  {unresolvedCount > 0 &&
                    ` · ${unresolvedCount} will be skipped (no category)`}
                </span>
                <Button
                  type="button"
                  onClick={() => commitMutation.mutate()}
                  disabled={busy || !assetId || effectiveSelected.length === 0}
                >
                  <FileUp className="mr-1 h-4 w-4" />
                  {commitMutation.isPending
                    ? "Importing…"
                    : `Import ${effectiveSelected.length} transactions`}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {result && (
        <Card>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/50 p-4 text-sm">
              <p className="font-medium">Import complete</p>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                <li>{result.imported} transactions imported</li>
                <li>{result.skipped} rows skipped</li>
              </ul>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => undoMutation.mutate(result.transaction_ids)}
                disabled={undoMutation.isPending || result.transaction_ids.length === 0}
              >
                <Undo2 className="mr-1 h-4 w-4" />
                {undoMutation.isPending ? "Undoing…" : "Undo import"}
              </Button>
              <Button type="button" onClick={() => setResult(null)}>
                Import another file
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
