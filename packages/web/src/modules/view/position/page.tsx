/**
 * [INPUT]: ./data, sections/position-grid, shared/layout/page-shell
 * [OUTPUT]: <PositionListPage /> — /positions 路由
 * [POS]: modules/view/position/page.tsx
 * [RUNTIME]: client
 * [PROTOCOL]: 加筛选 / 分组时在此层组合
 */
import { PageEmpty, PageError, PageShell } from "@/shared/layout/page-shell";
import { useApi } from "@/shared/hooks/use-api";
import { usePositions } from "./data";
import { PositionGrid } from "./sections/position-grid";

interface NetWorthPayload {
  total: number;
}

export function PositionListPage() {
  const { data, error, loading } = usePositions();
  const { data: nw } = useApi<NetWorthPayload>("/api/analytics/networth");
  const totalNetWorthBase = nw?.total ?? 0;

  return (
    <PageShell
      eyebrow="03 · POSITIONS"
      title="持仓"
      subtitle="按资产类别分组（基金 / 美股 / 港股 / A 股 / 加密），每类给出 CNY 市值、盈亏、占总仓位。"
    >
      {loading && <div className="h-64 animate-pulse rounded-md bg-card" />}
      {error && <PageError message={error.message} />}
      {data && data.positions.length === 0 && (
        <PageEmpty message="没有持仓。先用 finsight trade buy 或 finsight import md 录入。" />
      )}
      {data && data.positions.length > 0 && (
        <PositionGrid
          positions={data.positions}
          totalNetWorthBase={totalNetWorthBase}
        />
      )}
    </PageShell>
  );
}
