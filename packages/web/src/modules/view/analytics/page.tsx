/**
 * [INPUT]: ./data, sections/*, shared/layout/page-shell
 * [OUTPUT]: <AnalyticsPage /> — /analytics 路由
 * [POS]: modules/view/analytics/page.tsx
 * [RUNTIME]: client
 * [PROTOCOL]: 新增聚合维度时在此组合
 */
import { PageError, PageShell } from "@/shared/layout/page-shell";
import { useNetWorth } from "./data";
import { ByType } from "./sections/by-type";
import { ByCurrency } from "./sections/by-currency";

export function AnalyticsPage() {
  const { data, error, loading } = useNetWorth();

  return (
    <PageShell
      eyebrow="04 · ANALYTICS"
      title="分析"
      subtitle="按类型、按币种两个维度看清结构。"
    >
      {loading && <div className="h-64 animate-pulse rounded-md bg-card" />}
      {error && <PageError message={error.message} />}
      {data && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ByType breakdown={data} />
          <ByCurrency breakdown={data} />
        </div>
      )}
    </PageShell>
  );
}
