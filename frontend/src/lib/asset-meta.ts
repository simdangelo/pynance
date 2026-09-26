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
  current_account: "var(--color-petrol)",
  deposit_account: "var(--color-moss)",
  money_market_etf: "var(--color-teal)",
  government_bond: "var(--color-slate)",
  corporate_bond: "var(--color-plum)",
  bond_etf: "var(--color-ochre)",
  equity_etf: "var(--color-clay)",
  stock: "var(--color-rust)",
  other: "var(--color-stone)",
}

export const LIQUIDITY_CATEGORIES: LiquidityCategory[] = ["liquid", "reserve", "invested"]

export const LIQUIDITY_LABEL: Record<LiquidityCategory, string> = {
  liquid: "Liquid",
  reserve: "Reserve",
  invested: "Invested",
}

export const LIQUIDITY_COLOR: Record<LiquidityCategory, string> = {
  liquid: "var(--color-petrol)",
  reserve: "var(--color-moss)",
  invested: "var(--color-ochre)",
}
