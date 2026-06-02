/**
 * [INPUT]: shared/hooks/use-api
 * [OUTPUT]: useSymbols(), useSymbol(symbol), SymbolAggregate, SymbolDetail
 * [POS]: modules/view/symbol 数据真相源
 * [RUNTIME]: client
 * [PROTOCOL]: 与 server /api/symbols 协议同步
 */
import { useApi } from "@/shared/hooks/use-api";
import type { Decision } from "../decision/data";

export interface SymbolAccountLeg {
  account_id: string;
  account_name: string;
  position_id: string;
  quantity: number;
  avg_cost: number;
  current_price: number;
  currency: string;
  market_value: number;
  cost_basis: number;
  pnl: number;
  pnl_pct: number;
  market_value_base: number;
  cost_basis_base: number;
  pnl_base: number;
  fx_to_base: number;
}

export type AssetClass =
  | "us-stock"
  | "hk-stock"
  | "a-stock"
  | "fund"
  | "cash"
  | "crypto"
  | "other";

export interface SymbolAggregate {
  symbol: string;
  name: string | null;
  currencies: string[];
  primary_currency: string;
  asset_class: AssetClass;
  total_quantity: number;
  avg_cost: number;
  current_price: number | null;
  market_value_native: number | null;
  cost_basis_native: number | null;
  pnl_native: number | null;
  market_value_base: number;
  cost_basis_base: number;
  pnl_base: number;
  pnl_pct_base: number;
  portfolio_weight: number;
  account_count: number;
}

/** One cross-account transaction row tied to this symbol. */
export interface SymbolTransaction {
  id: string;
  account_id: string;
  account_name: string | null;
  type: string;
  amount: number;
  quantity: number | null;
  price: number | null;
  fee: number;
  currency: string;
  notes: string | null;
  traded_at: string;
}

export interface SymbolDetail extends SymbolAggregate {
  legs: SymbolAccountLeg[];
  transactions: SymbolTransaction[];
  decisions: Decision[];
}

export function useSymbols() {
  return useApi<{ symbols: SymbolAggregate[] }>("/api/symbols");
}

export function useSymbol(symbol: string | undefined) {
  return useApi<SymbolDetail>(
    symbol ? `/api/symbols/${encodeURIComponent(symbol)}` : "/api/symbols",
  );
}
