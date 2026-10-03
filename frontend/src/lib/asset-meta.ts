import type { AssetClass, LiquidityCategory } from "@/types/api"

export const ASSET_CLASSES: AssetClass[] = [
  "current_account",
  "deposit_account",
  "money_market_etf",
  "government_bond",
  "corporate_bond",
  "bond_etf",
  "equity_etf",
  "stock",
  "other",
]

export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  current_account: "Current account",
  deposit_account: "Deposit account",
  money_market_etf: "Money market ETF",
  government_bond: "Government bond",
  corporate_bond: "Corporate bond",
  bond_etf: "Bond ETF",
  equity_etf: "Equity ETF",
  stock: "Stock",
  other: "Other",
}

export const ASSET_CLASS_COLOR: Record<AssetClass, string> = {
  current_account: "var(--color-chart-1)",
  deposit_account: "var(--color-positive)",
  money_market_etf: "var(--color-chart-2)",
  government_bond: "var(--color-chart-6)",
  corporate_bond: "var(--color-chart-3)",
  bond_etf: "var(--color-chart-5)",
  equity_etf: "var(--color-chart-4)",
  stock: "var(--color-chart-8)",
  other: "var(--color-muted-foreground)",
}

export const LIQUIDITY_CATEGORIES: LiquidityCategory[] = ["liquid", "reserve", "invested"]

export const LIQUIDITY_LABEL: Record<LiquidityCategory, string> = {
  liquid: "Liquid",
  reserve: "Reserve",
  invested: "Invested",
}

export const LIQUIDITY_COLOR: Record<LiquidityCategory, string> = {
  liquid: "var(--color-chart-1)",
  reserve: "var(--color-positive)",
  invested: "var(--color-chart-5)",
}
