import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ChevronLeft, ChevronRight, FileUp, Info, ListPlus, Loader2, Undo2, Upload } from "lucide-react"

import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import type {
  Category,
  ImportCommitResult,
  ImportMapping,
  ImportPreview,
  ImportRow,
  TransactionType,
} from "@/types/api"
import { PageHeader } from "@/components/page-header"
import { Money } from "@/components/money"
import { TypeBadge } from "@/components/type-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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

interface BulkPlan {
  rows: { index: number; categoryId: number }[]
  gaps: { index: number; key: string; name: string }[]
  toCreate: { name: string; direction: TransactionType }[]
  conflicts: number
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
  const { user } = useAuth()
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
  const [confirmPlan, setConfirmPlan] = useState<BulkPlan | null>(null)
  const [creatingCategories, setCreatingCategories] = useState(false)
  const [pageSize, setPageSize] = useState<number | "all">(20)
  const [page, setPage] = useState(1)

  const { data: assets } = useQuery({ queryKey: ["assets"], queryFn: api.assets.list })
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: api.categories.list,
  })

  // Transactions can only live on liquid assets; money reaches the others
  // through transfers.
  const liquidAssets = useMemo(
    () => (assets ?? []).filter((asset) => asset.liquidity_category === "liquid"),
    [assets],
  )

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
    const liquid = assets.filter((asset) => asset.liquidity_category === "liquid")
    const preferred =
      liquid.find((asset) => asset.id === user?.default_asset_id) ?? liquid[0]
    if (!preferred) return
    setAssetId(String(preferred.id))
    if (file) runPreview({ assetId: String(preferred.id) })
  }, [assets, assetId, file, runPreview, user?.default_asset_id])

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
        (category) => category.name.trim().toLowerCase() === value.trim().toLowerCase(),
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

  // A row whose category isn't in the database yet can still be selected:
  // the import will offer to create it before committing.
  const needsCategoryCreation = useCallback(
    (row: ImportRow): boolean => {
      if (rowCategoryIds[row.index] !== undefined) return false
      const value = fileValueOf(row)
      return Boolean(value && row.direction && !exactNameCategory(value))
    },
    [exactNameCategory, fileValueOf, rowCategoryIds],
  )

  const isSelectable = useCallback(
    (row: ImportRow) =>
      row.status !== "invalid" &&
      (effectiveCategoryId(row) !== undefined || needsCategoryCreation(row)),
    [effectiveCategoryId, needsCategoryCreation],
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

  useEffect(() => {
    setPage(1)
  }, [preview])

  const previewRows = preview?.rows ?? []
  const perPage = pageSize === "all" ? Math.max(1, previewRows.length) : pageSize
  const pageCount = Math.max(1, Math.ceil(previewRows.length / perPage))
  const currentPage = Math.min(page, pageCount)
  const visibleRows =
    pageSize === "all"
      ? previewRows
      : previewRows.slice((currentPage - 1) * perPage, currentPage * perPage)
  const rangeStart = previewRows.length === 0 ? 0 : (currentPage - 1) * perPage + 1
  const rangeEnd = Math.min(currentPage * perPage, previewRows.length)

  const unresolvedCount = useMemo(
    () =>
      (preview?.rows ?? []).filter(
        (row) => row.status !== "invalid" && !isSelectable(row),
      ).length,
    [preview, isSelectable],
  )

  const buildPlan = useCallback(
    (indexes: Set<number> | null): BulkPlan => {
      const existingByName = new Map<string, Category>(
        (categories ?? []).map((category) => [category.name.trim().toLowerCase(), category]),
      )
      const toCreate = new Map<string, { name: string; direction: TransactionType }>()
      const rows: BulkPlan["rows"] = []
      const gaps: BulkPlan["gaps"] = []
      let conflicts = 0

      for (const row of preview?.rows ?? []) {
        if (row.status === "invalid") continue
        if (indexes && !indexes.has(row.index)) continue
        const manualId = rowCategoryIds[row.index]
        if (manualId !== undefined) {
          rows.push({ index: row.index, categoryId: manualId })
          continue
        }
        const value = fileValueOf(row)
        if (!value) continue
        const key = value.toLowerCase()
        const existing = existingByName.get(key)
        if (existing) {
          if (!row.direction || existing.transaction_type === row.direction) {
            rows.push({ index: row.index, categoryId: existing.id })
          } else {
            conflicts += 1
          }
          continue
        }
        if (!row.direction) continue
        if (!toCreate.has(key)) {
          toCreate.set(key, { name: value, direction: row.direction })
        }
        gaps.push({ index: row.index, key, name: value })
      }

      return { rows, gaps, toCreate: [...toCreate.values()], conflicts }
    },
    [categories, fileValueOf, preview, rowCategoryIds],
  )

  const bulkPlan = useMemo(() => buildPlan(null), [buildPlan])
  const bulkTotal = bulkPlan.rows.length + bulkPlan.gaps.length
  const selectedPlan = useMemo(
    () => buildPlan(new Set(effectiveSelected)),
    [buildPlan, effectiveSelected],
  )
  const selectedTotal = selectedPlan.rows.length + selectedPlan.gaps.length

  const commitMutation = useMutation({
    mutationFn: (rows: { index: number; categoryId: number }[]) =>
      api.importData.commit(file as File, {
        mapping,
        dateFormat,
        delimiter: delimiter === "__auto__" ? null : delimiter,
        sheet,
        assetId: Number(assetId),
        selectedIndexes: rows.map((row) => row.index),
        rowCategories: rows.map((row) => ({
          index: row.index,
          category_id: row.categoryId,
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

  const runPlan = async (plan: BulkPlan) => {
    setConfirmPlan(null)
    const createdIds = new Map<string, number>()
    if (plan.toCreate.length > 0) {
      setCreatingCategories(true)
      const failed: string[] = []
      for (const item of plan.toCreate) {
        try {
          const created = await api.categories.create({
            name: item.name,
            transaction_type: item.direction,
          })
          createdIds.set(item.name.toLowerCase(), created.id)
        } catch {
          failed.push(item.name)
        }
      }
      setCreatingCategories(false)
      queryClient.invalidateQueries({ queryKey: ["categories"] })
      if (failed.length > 0) {
        toast.error(`Could not create: ${failed.join(", ")}`)
      }
    }

    const rows = [...plan.rows]
    for (const gap of plan.gaps) {
      const id = createdIds.get(gap.key)
      if (id !== undefined) rows.push({ index: gap.index, categoryId: id })
    }
    rows.sort((a, b) => a.index - b.index)

    if (rows.length === 0) {
      toast.error("Nothing to import — no row has a resolvable category")
      return
    }
    commitMutation.mutate(rows)
  }

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
  const busy =
    previewMutation.isPending || commitMutation.isPending || creatingCategories

  return (
    <div className="space-y-5">
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
                        {field.required && <span className="ml-0.5 text-destructive">*</span>}
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
                <span className="text-destructive">*</span> required
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
                {liquidAssets.length === 0 ? (
                  <div className="rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
                    No liquid assets yet. Create one in the Assets page first —
                    transactions can only use liquid assets.
                  </div>
                ) : (
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
                        {liquidAssets.find((asset) => String(asset.id) === assetId)?.name ??
                          "Select an asset"}
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
                <p className="text-xs text-muted-foreground">
                  Which account these transactions belong to (liquid only).
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
                      <span className="text-destructive">{unresolvedCount} without category</span>
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
                  {visibleRows.map((row) => {
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
                            <span className="text-destructive">{row.reason}</span>
                          ) : !selectable ? (
                            <span className="text-destructive">Choose a category</span>
                          ) : row.status === "duplicate" ? (
                            <span className="text-muted-foreground">Duplicate</span>
                          ) : needsCategoryCreation(row) ? (
                            <span className="text-muted-foreground">New category</span>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Rows per page</span>
                  <Select
                    value={pageSize === "all" ? "all" : String(pageSize)}
                    disabled={busy}
                    onValueChange={(value) => {
                      if (!value) return
                      setPageSize(value === "all" ? "all" : Number(value))
                      setPage(1)
                    }}
                  >
                    <SelectTrigger size="sm" className="w-[104px]">
                      <SelectValue>
                        {pageSize === "all" ? "Show all" : pageSize}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="all">Show all</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-xs">
                    {rangeStart}–{rangeEnd} of {previewRows.length}
                  </span>
                </div>

                {pageSize !== "all" && (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label="Previous page"
                      disabled={busy || currentPage <= 1}
                      onClick={() =>
                        setPage((previous) => Math.max(1, previous - 1))
                      }
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden />
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {currentPage} of {pageCount}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label="Next page"
                      disabled={busy || currentPage >= pageCount}
                      onClick={() =>
                        setPage((previous) => Math.min(pageCount, previous + 1))
                      }
                    >
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3">
                <span className="text-sm text-muted-foreground">
                  {effectiveSelected.length} of {summary?.ok ?? 0} ready rows selected
                  {unresolvedCount > 0 &&
                    ` · ${unresolvedCount} will be skipped (no usable category)`}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || !assetId || selectedTotal === 0}
                  onClick={() => {
                    if (selectedPlan.toCreate.length > 0) setConfirmPlan(selectedPlan)
                    else void runPlan(selectedPlan)
                  }}
                >
                  <FileUp className="mr-1 h-4 w-4" />
                  Import {selectedTotal} selected
                </Button>
                <Button
                  type="button"
                  disabled={busy || !assetId || bulkTotal === 0}
                  onClick={() => {
                    if (bulkPlan.toCreate.length > 0) setConfirmPlan(bulkPlan)
                    else void runPlan(bulkPlan)
                  }}
                >
                  <ListPlus className="mr-1 h-4 w-4" />
                  {creatingCategories
                    ? "Creating categories…"
                    : commitMutation.isPending
                      ? "Importing…"
                      : `Import all ${bulkTotal}`}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Dialog
            open={confirmPlan !== null}
            onOpenChange={(open) => {
              if (!open) setConfirmPlan(null)
            }}
          >
            <DialogContent className="sm:max-w-md">
              {confirmPlan && (
                <>
                  <DialogHeader>
                    <DialogTitle>
                      Create {confirmPlan.toCreate.length}{" "}
                      {confirmPlan.toCreate.length === 1 ? "category" : "categories"}?
                    </DialogTitle>
                    <DialogDescription>
                      They are used in the file but don’t exist yet. They will be
                      created first, then{" "}
                      {confirmPlan.rows.length + confirmPlan.gaps.length}{" "}
                      transactions will be imported.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4">
                    {(["expense", "income"] as const).map((direction) => {
                      const items = confirmPlan.toCreate.filter(
                        (item) => item.direction === direction,
                      )
                      if (items.length === 0) return null
                      return (
                        <div key={direction} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <TypeBadge type={direction} />
                            <span className="text-xs text-muted-foreground">
                              {items.length} new
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {items.map((item) => (
                              <span
                                key={item.name}
                                className="rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs"
                              >
                                {item.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {confirmPlan.conflicts > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {confirmPlan.conflicts} row
                      {confirmPlan.conflicts === 1 ? "" : "s"} use a name that
                      already exists with the opposite type and will be skipped —
                      fix them in the table first.
                    </p>
                  )}

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setConfirmPlan(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void runPlan(confirmPlan)}
                    >
                      Create and import
                    </Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>
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
