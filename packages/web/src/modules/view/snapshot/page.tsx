/**
 * [INPUT]: ./data, sections/*, shared/layout/page-shell
 * [OUTPUT]: <SnapshotListPage /> — /snapshots 路由
 * [POS]: modules/view/snapshot/page.tsx
 * [RUNTIME]: client
 * [PROTOCOL]: 加 diff UI 时在此组合
 */
import { Card, CardContent } from "@/shared/ui/card";
import { PageError, PageShell } from "@/shared/layout/page-shell";
import { useSnapshots } from "./data";
import { SnapshotTrend } from "./sections/snapshot-trend";
import { SnapshotTable } from "./sections/snapshot-table";

export function SnapshotListPage() {
  const { data, error, loading } = useSnapshots();

  return (
    <PageShell
      eyebrow="03 · SNAPSHOTS"
      title="快照"
      subtitle="净值随时间的变化轨迹。每条快照都包含当时所有账户的全貌。"
    >
      {loading && <div className="h-64 animate-pulse rounded-md bg-card" />}
      {error && <PageError message={error.message} />}
      {data && (
        <>
          <SnapshotTrend snapshots={data.snapshots} />
          <Card className="card-flat">
            <CardContent className="p-0">
              <SnapshotTable snapshots={data.snapshots} />
            </CardContent>
          </Card>
        </>
      )}
    </PageShell>
  );
}
