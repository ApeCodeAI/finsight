/**
 * [INPUT]: shared/hooks/use-api
 * [OUTPUT]: usePositions(), PositionListRow 类型
 * [POS]: modules/view/position 数据真相源
 * [RUNTIME]: client
 * [PROTOCOL]: API 变化时同步 server/index.ts /api/positions
 */
import { useApi } from "@/shared/hooks/use-api";

export type AssetClass =
  | "us-stock"
  | "hk-stock"
  | "a-stock"
  | "fund"
  | "cash"
  | "crypto"
  | "other";

export interface PositionListRow {
  id: string;
  account_id: string;
  account_name: string | null;
  symbol: string;
  name: string | null;
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
  asset_class: AssetClass;
}

export function usePositions() {
  return useApi<{ positions: PositionListRow[] }>("/api/positions");
}
