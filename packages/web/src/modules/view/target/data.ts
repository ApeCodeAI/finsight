/**
 * [INPUT]: shared/hooks/use-api
 * [OUTPUT]: useTargets / useTargetCheck hooks + Target / TargetGap types
 * [POS]: modules/view/target 数据真相源
 * [RUNTIME]: client
 * [PROTOCOL]: 与 server /api/targets* 协议同步
 */
import { useApi } from "@/shared/hooks/use-api";

export type GapStatus = "under" | "over" | "on_target";

export interface TargetAllocation {
  asset_class: string;
  weight: number;
  min?: number;
  max?: number;
}

export interface Target {
  id: string;
  name: string;
  is_active: boolean;
  allocations: TargetAllocation[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TargetGap {
  asset_class: string;
  label: string;
  target_weight: number;
  current_weight: number;
  current_value_base: number;
  target_value_base: number;
  gap_weight: number;
  gap_value_base: number;
  status: GapStatus;
}

export interface TargetCheckResult {
  target_id: string;
  target_name: string;
  total_base: number;
  base_currency: string;
  gaps: TargetGap[];
  max_drift: number;
}

export function useTargets() {
  return useApi<{ targets: Target[]; active: Target | null }>("/api/targets");
}

export function useTargetCheck() {
  return useApi<TargetCheckResult>("/api/targets/check");
}
