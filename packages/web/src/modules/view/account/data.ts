/**
 * [INPUT]: shared/hooks/use-api
 * [OUTPUT]: useAccounts(), useAccount(id), Account, AccountDetail 类型
 * [POS]: modules/view/account 数据真相源
 * [RUNTIME]: client
 * [PROTOCOL]: API schema 变化时同步 server/index.ts 中的 /api/accounts*
 */
import { useApi } from "@/shared/hooks/use-api";
import type { Decision } from "../decision/data";

export interface AccountRow {
  id: string;
  name: string;
  type: string;
  currency: string;
  institution: string | null;
  tags: string[];
  balance: number;
  total_value: number;
  total_value_base: number;
  notes: string | null;
  is_active: number;
}

export interface PositionRow {
  id: string;
  account_id: string;
  symbol: string;
  name: string | null;
  quantity: number;
  avg_cost: number;
  current_price: number;
  currency: string;
  tags: string[];
  /** native-currency values */
  market_value: number;
  cost_basis: number;
  pnl: number;
  pnl_pct: number;
  /** CNY-normalized values (filled by server when FX is known) */
  market_value_base: number;
  cost_basis_base: number;
  pnl_base: number;
  fx_to_base: number;
  opened_at: string | null;
  closed_at: string | null;
}

export interface AccountSummary {
  cash_base: number;
  positions_total_base: number;
  account_total_base: number;
}

export interface TransactionRow {
  id: string;
  account_id: string;
  position_id: string | null;
  type: string;
  amount: number;
  quantity: number | null;
  price: number | null;
  fee: number;
  currency: string;
  notes: string | null;
  traded_at: string;
}

export interface HistoryPoint {
  id: string;
  snapshot_date: string;
  total_net_worth: number;
  source: "historical" | "current";
}

export interface AccountDetail {
  account: AccountRow;
  positions: PositionRow[];
  transactions: TransactionRow[];
  history: HistoryPoint[];
  summary: AccountSummary;
  decisions: Decision[];
}

export function useAccounts() {
  return useApi<{ accounts: AccountRow[] }>("/api/accounts");
}

export function useAccount(id: string | undefined) {
  return useApi<AccountDetail>(id ? `/api/accounts/${id}` : "/api/accounts");
}
