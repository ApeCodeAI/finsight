/**
 * [INPUT]: shared/hooks/use-api
 * [OUTPUT]: useDecisions / useDecision / useDecisionAlerts hooks + Decision types
 * [POS]: modules/view/decision 数据真相源
 * [RUNTIME]: client
 * [PROTOCOL]: 与 server /api/decisions* 协议同步
 */
import { useApi } from "@/shared/hooks/use-api";

export type DecisionType =
  | "rationale"
  | "target"
  | "stop-loss"
  | "rethink"
  | "retro"
  | "note";

export type Conviction = "low" | "medium" | "high";
export type Horizon = "1m" | "3m" | "12m" | "3y";

export interface Decision {
  id: string;
  date: string;
  type: DecisionType;
  title: string;
  body: string;
  symbols: string[];
  accounts: string[];
  transaction_id: string | null;
  conviction: Conviction | null;
  exit_target: number | null;
  stop_loss: number | null;
  horizon: Horizon | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface DecisionAlert {
  decision_id: string;
  symbol: string;
  kind: "exit_target" | "stop_loss";
  threshold: number;
  current_price: number;
  triggered: boolean;
  decision_title: string;
}

export interface PendingRationaleRow {
  transaction_id: string;
  traded_at: string;
  type: string;
  account_id: string;
  price: number | null;
  quantity: number | null;
  notes: string | null;
}

export function useDecisions(params?: {
  symbol?: string;
  account?: string;
  type?: DecisionType;
}) {
  const q = new URLSearchParams();
  if (params?.symbol) q.set("symbol", params.symbol);
  if (params?.account) q.set("account", params.account);
  if (params?.type) q.set("type", params.type);
  const path = q.toString() ? `/api/decisions?${q}` : "/api/decisions";
  return useApi<{ decisions: Decision[] }>(path);
}

export function useDecision(id: string | undefined) {
  return useApi<Decision>(id ? `/api/decisions/${id}` : "/api/decisions");
}

export function useDecisionAlerts() {
  return useApi<{
    triggered: DecisionAlert[];
    all_thresholds: DecisionAlert[];
    pending_rationale: PendingRationaleRow[];
  }>("/api/decisions/alerts");
}
