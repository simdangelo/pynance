export type TransactionType = "income" | "expense"

export type Frequency = "yearly" | "monthly" | "weekly" | "custom"

export type AssetClass =
  | "current_account"
  | "deposit_account"
  | "money_market_etf"
  | "government_bond"
  | "corporate_bond"
  | "bond_etf"
  | "equity_etf"
  | "stock"
  | "other"

export type LiquidityCategory = "liquid" | "reserve" | "invested"

export interface User {
  id: number
  email: string
}

export interface ImportResult {
  categories_created: number
  transactions_imported: number
  skipped: number
}

export interface ImportPreviewRow {
  description: string
  occurred_on: string
  transaction_type: TransactionType
  category: string
  amount: string
}

export interface ImportPreview {
  rows: ImportPreviewRow[]
}

export interface Category {
  id: number
  name: string
  transaction_type: TransactionType
  created_at: string
}

export interface Asset {
  id: number
  name: string
  asset_class: AssetClass
  bucket_id: number
  liquidity_category: LiquidityCategory
  opening_balance: string
  created_at: string
  balance: string
}

export interface AssetInput {
  name: string
  asset_class: AssetClass
  bucket_id: number
  opening_balance: string
}

export interface Bucket {
  id: number
  name: string
  description: string | null
  liquidity_category: LiquidityCategory
  sort_order: number
  created_at: string
}

export interface BucketInput {
  name: string
  description?: string | null
  liquidity_category: LiquidityCategory
  sort_order?: number
}

export interface LiquidityAllocationRow {
  liquidity_category: LiquidityCategory
  total: string
}

export interface BucketAllocationRow {
  bucket_id: number
  bucket_name: string
  liquidity_category: LiquidityCategory
  total: string
}

export interface Allocation {
  by_liquidity: LiquidityAllocationRow[]
  by_bucket: BucketAllocationRow[]
}

export interface Transaction {
  id: number
  transaction_type: TransactionType
  amount: string
  category_id: number
  asset_id: number
  description: string
  occurred_on: string
  created_at: string
}

export interface Transfer {
  id: number
  source_asset_id: number
  destination_asset_id: number
  amount: string
  description: string
  occurred_on: string
  created_at: string
}

export interface TransferInput {
  source_asset_id: number
  destination_asset_id: number
  amount: string
  description: string
  occurred_on: string
}

export interface NetWorthTrendPoint {
  year: number
  month: number
  amount: string
}

export interface Summary {
  income: string
  expense: string
}

export interface SummaryByCategoryRow {
  category_id: number
  category_name: string
  amount: string
}

export interface TrendPoint {
  year: number
  month: number
  income: string
  expense: string
}

export interface TrendByCategoryPoint {
  year: number
  month: number
  amount: string
}

export interface TrendByCategory {
  category_id: number
  category_name: string
  points: TrendByCategoryPoint[]
}

export interface Comparison {
  current: Summary
  previous: Summary
}

export interface RecurringTemplate {
  id: number
  description: string
  amount: string
  category_id: number
  frequency: Frequency
  interval: number
  next_occurrence: string
  active: boolean
  created_at: string
  due: boolean
}

export interface RecurringTemplateInput {
  description: string
  amount: string
  category_id: number
  frequency: Frequency
  interval: number
  next_occurrence: string
  active: boolean
}
