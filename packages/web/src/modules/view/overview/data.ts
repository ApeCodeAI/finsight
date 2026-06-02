/**
 * [INPUT]: shared/lib/fetcher, shared/hooks/use-api
 * [OUTPUT]: useOverview() + OverviewPayload 类型
 * [POS]: modules/view/overview 的数据真相源
 * [RUNTIME]: client
 * [PROTOCOL]: API schema 变化时同步本文件 + server/index.ts /api/overview
 */
import { useApi } from "@/shared/hooks/use-api";

export interface OverviewAccount {
  id: string;
  name: string;
  type: string;
  balance: number;
  balance_base: number;
  currency: string;
}

export interface OverviewSnapshot {
  id: string;
  date: string;
  total: number;
}

export interface OverviewPayload {
  snapshot_date: string;
  total_net_worth: number;
  currency: string;
  allocation: Record<string, number>;
  by_account: OverviewAccount[];
  snapshots: OverviewSnapshot[];
}

export function useOverview() {
  return useApi<OverviewPayload>("/api/overview");
}
