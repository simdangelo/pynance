import type {
  Allocation,
  Asset,
  AssetInput,
  BalanceAdjustment,
  BotInfo,
  Bucket,
  BucketInput,
  Category,
  Comparison,
  ImportCommitResult,
  ImportMapping,
  ImportPreview,
  LinkCodeResponse,
  NetWorthTrendPoint,
  ReconciliationInput,
  ReconciliationResult,
  RecurringTemplate,
  RecurringTemplateInput,
  Summary,
  SummaryByCategoryRow,
  Transaction,
  Transfer,
  TransferInput,
  TrendByCategory,
  TrendPoint,
  User,
} from "@/types/api"

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...init,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new ApiError(response.status, body?.detail ?? response.statusText)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export interface TransactionListParams {
  q?: string
  year?: number
  month?: number
  transaction_type?: string
  category_id?: number
}

function toQueryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value))
    }
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ""
}

interface ImportPreviewConfig {
  mapping?: ImportMapping | null
  dateFormat?: string
  sheet?: string | null
  delimiter?: string | null
  assetId?: number | null
}

interface ImportCommitConfig {
  assetId: number
  selectedIndexes: number[]
  rowCategories: { index: number; category_id: number }[]
  mapping?: ImportMapping | null
  dateFormat?: string
  sheet?: string | null
  delimiter?: string | null
}

function importFormData(
  file: File,
  config: ImportPreviewConfig | ImportCommitConfig,
): FormData {
  const formData = new FormData()
  formData.append("file", file)
  if (config.mapping) formData.append("mapping", JSON.stringify(config.mapping))
  if (config.dateFormat) formData.append("date_format", config.dateFormat)
  if (config.sheet) formData.append("sheet", config.sheet)
  if (config.delimiter) formData.append("delimiter", config.delimiter)
  if (config.assetId != null) formData.append("asset_id", String(config.assetId))
  if ("selectedIndexes" in config) {
    formData.append("selected_indexes", JSON.stringify(config.selectedIndexes))
    formData.append("row_categories", JSON.stringify(config.rowCategories))
  }
  return formData
}

export const api = {
  auth: {
    register: (data: { email: string; password: string }) =>
      request<User>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    login: (data: { email: string; password: string }) =>
      request<User>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    logout: () => request<void>("/api/auth/logout", { method: "POST" }),
    me: () => request<User>("/api/auth/me"),
    updateMe: (data: { default_asset_id: number | null }) =>
      request<User>("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
  },
  importData: {
    preview: (file: File, config: ImportPreviewConfig = {}) =>
      request<ImportPreview>("/api/import/preview", {
        method: "POST",
        body: importFormData(file, config),
        headers: {},
      }),
    commit: (file: File, config: ImportCommitConfig) =>
      request<ImportCommitResult>("/api/import/commit", {
        method: "POST",
        body: importFormData(file, config),
        headers: {},
      }),
  },
  categories: {
    list: () => request<Category[]>("/api/categories"),
    create: (data: { name: string; transaction_type: string }) =>
      request<Category>("/api/categories", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: number, data: { name?: string; transaction_type?: string }) =>
      request<Category>(`/api/categories/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    remove: (id: number) => request<void>(`/api/categories/${id}`, { method: "DELETE" }),
  },
  transactions: {
    list: (params: TransactionListParams = {}) =>
      request<Transaction[]>(
        `/api/transactions${toQueryString({
          q: params.q,
          year: params.year,
          month: params.month,
          transaction_type: params.transaction_type,
          category_id: params.category_id,
        })}`,
      ),
    create: (data: unknown) =>
      request<Transaction>("/api/transactions", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: number, data: unknown) =>
      request<Transaction>(`/api/transactions/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    remove: (id: number) =>
      request<void>(`/api/transactions/${id}`, { method: "DELETE" }),
    bulkDelete: (ids: number[]) =>
      request<{ deleted: number }>("/api/transactions/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ ids }),
      }),
    summary: (year: number, month: number, filters: { category_id?: number; transaction_type?: string } = {}) =>
      request<Summary>(
        `/api/transactions/summary${toQueryString({
          year,
          month,
          category_id: filters.category_id,
          transaction_type: filters.transaction_type,
        })}`,
      ),
    summaryByCategory: (type: string, year: number, month: number, filters: { category_id?: number } = {}) =>
      request<SummaryByCategoryRow[]>(
        `/api/transactions/summary-by-category${toQueryString({
          transaction_type: type,
          year,
          month,
          category_id: filters.category_id,
        })}`,
      ),
    trend: (startDate: string, endDate: string) =>
      request<TrendPoint[]>(
        `/api/transactions/trend?start_date=${startDate}&end_date=${endDate}`,
      ),
    trendByCategory: (startDate: string, endDate: string) =>
      request<TrendByCategory[]>(
        `/api/transactions/trend-by-category?start_date=${startDate}&end_date=${endDate}`,
      ),
    comparison: (year: number, month: number, filters: { category_id?: number; transaction_type?: string } = {}) =>
      request<Comparison>(
        `/api/transactions/comparison${toQueryString({
          year,
          month,
          category_id: filters.category_id,
          transaction_type: filters.transaction_type,
        })}`,
      ),
  },
  recurringTemplates: {
    list: () => request<RecurringTemplate[]>("/api/recurring-template"),
    create: (data: RecurringTemplateInput) =>
      request<RecurringTemplate>("/api/recurring-template", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: number, data: Partial<RecurringTemplateInput>) =>
      request<RecurringTemplate>(`/api/recurring-template/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    remove: (id: number) =>
      request<void>(`/api/recurring-template/${id}`, { method: "DELETE" }),
    generate: (id: number) =>
      request<Transaction>(`/api/recurring-template/${id}/generate`, {
        method: "POST",
      }),
  },
  assets: {
    list: () => request<Asset[]>("/api/assets"),
    create: (data: AssetInput) =>
      request<Asset>("/api/assets", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: number, data: Partial<AssetInput>) =>
      request<Asset>(`/api/assets/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    remove: (id: number) => request<void>(`/api/assets/${id}`, { method: "DELETE" }),
    netWorthTrend: (startDate: string, endDate: string) =>
      request<NetWorthTrendPoint[]>(
        `/api/assets/net-worth-trend?start_date=${startDate}&end_date=${endDate}`,
      ),
    allocation: () => request<Allocation>("/api/assets/allocation"),
  },
  adjustments: {
    reconcile: (data: ReconciliationInput) =>
      request<ReconciliationResult>("/api/adjustments/reconcile", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    list: (assetId?: number) =>
      request<BalanceAdjustment[]>(
        `/api/adjustments${assetId ? `?asset_id=${assetId}` : ""}`,
      ),
    remove: (id: number) => request<void>(`/api/adjustments/${id}`, { method: "DELETE" }),
  },
  buckets: {
    list: () => request<Bucket[]>("/api/buckets"),
    create: (data: BucketInput) =>
      request<Bucket>("/api/buckets", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: number, data: Partial<BucketInput>) =>
      request<Bucket>(`/api/buckets/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    remove: (id: number, reassignTo?: number) =>
      request<void>(
        `/api/buckets/${id}${reassignTo ? `?reassign_to=${reassignTo}` : ""}`,
        { method: "DELETE" },
      ),
  },
  transfers: {
    list: (params: { q?: string; year?: number; month?: number } = {}) =>
      request<Transfer[]>(
        `/api/transfers${toQueryString({
          q: params.q,
          year: params.year,
          month: params.month,
        })}`,
      ),
    create: (data: TransferInput) =>
      request<Transfer>("/api/transfers", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: number, data: Partial<TransferInput>) =>
      request<Transfer>(`/api/transfers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    remove: (id: number) => request<void>(`/api/transfers/${id}`, { method: "DELETE" }),
  },
  telegram: {
    botInfo: () => request<BotInfo>("/api/telegram/bot"),
    createLinkCode: () =>
      request<LinkCodeResponse>("/api/telegram/link-code", { method: "POST" }),
    revokeLinkCodes: () =>
      request<void>("/api/telegram/link-code", { method: "DELETE" }),
  },
}
