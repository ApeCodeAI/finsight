/**
 * [INPUT]: shared/hooks/use-api
 * [OUTPUT]: useSnapshots(), SnapshotRow 类型
 * [POS]: modules/view/snapshot 数据真相源
 * [RUNTIME]: client
 * [PROTOCOL]: API 变化时同步 server/index.ts /api/snapshots
 */
import { useApi } from "@/shared/hooks/use-api";

export interface SnapshotRow {
  id: string;
  snapshot_date: string;
  total_net_worth: number;
  notes: string | null;
  created_at: string;
}

export function useSnapshots() {
  return useApi<{ snapshots: SnapshotRow[] }>("/api/snapshots");
}
