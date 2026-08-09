export type TransactionType = "income" | "expense"

export interface Category {
  id: number
  name: string
  transaction_type: TransactionType
  created_at: string
}

export interface Transaction {
  id: number
  transaction_type: TransactionType
  amount: string
  category_id: number
  description: string
  occurred_on: string
  created_at: string
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
