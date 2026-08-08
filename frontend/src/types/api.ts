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

export interface MonthlySummary {
  income: string
  expense: string
}

export interface SpendingRow {
  category_id: number
  category_name: string
  amount: string
}
