/**
 * [INPUT]: shared/hooks/use-api
 * [OUTPUT]: useNetWorth(), useAllocation()
 * [POS]: modules/view/analytics 数据真相源
 * [RUNTIME]: client
 * [PROTOCOL]: API 变化时同步 server/index.ts /api/analytics/*
 */
import { useApi } from "@/shared/hooks/use-api";

export interface NetWorthBreakdown {
  total: number;
  currency: string;
  byAccount: Array<{
    id: string;
    name: string;
    type: string;
    balance: number;
    balance_base: number;
    currency: string;
  }>;
}

export function useNetWorth() {
  return useApi<NetWorthBreakdown>("/api/analytics/networth");
}

export function useAllocation() {
  return useApi<{ allocation: Record<string, number> }>("/api/analytics/allocation");
}
