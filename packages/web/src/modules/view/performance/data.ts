/**
 * [INPUT]: shared/hooks/use-api
 * [OUTPUT]: usePerformance() + PerformanceRow / PerformancePayload
 * [POS]: modules/view/performance 数据真相源
 * [RUNTIME]: client
 * [PROTOCOL]: 与 server /api/performance 对齐
 */
import { useApi } from "@/shared/hooks/use-api";

export interface PerformanceRow {
  account_id: string | null;
  account_name: string;
  currency: string;
  period_start: string;
  period_end: string;
  days: number;
  net_deposits: number;
  current_value: number;
  total_return: number;
  total_return_pct: number | null;
  cagr: number | null;
  xirr: number | null;
  cashflow_count: number;
}

export interface PerformancePayload {
  accounts: PerformanceRow[];
  overall: PerformanceRow;
}

export function usePerformance() {
  return useApi<PerformancePayload>("/api/performance");
}
