/**
 * [INPUT]: ./data, sections/decision-list-table, shared/layout/page-shell
 * [OUTPUT]: <DecisionListPage /> — /decisions 列表
 * [POS]: modules/view/decision/page.tsx
 * [RUNTIME]: client
 * [PROTOCOL]: 加筛选 / 排序时在此组合
 */
import { useState } from "react";
import { Card, CardContent } from "@/shared/ui/card";
import { PageError, PageShell } from "@/shared/layout/page-shell";
import { useDecisions, type DecisionType } from "./data";
import {
  DecisionListTable,
  DECISION_TYPE_LABEL,
} from "./sections/decision-list-table";

const TYPES: (DecisionType | "all")[] = [
  "all",
  "rationale",
  "target",
  "stop-loss",
  "rethink",
  "retro",
  "note",
];

export function DecisionListPage() {
  const [filter, setFilter] = useState<DecisionType | "all">("all");
  const { data, error, loading } = useDecisions(
    filter === "all" ? undefined : { type: filter },
  );

  return (
    <PageShell
      eyebrow="DECISIONS"
      title="决策日志"
      subtitle="记录交易理由、目标价、止损位、中途重审、复盘和日常随笔。db-first，每日 sync 到 vault markdown。"
    >
      <div className="flex flex-wrap gap-2">
        {TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setFilter(t)}
            className={
              "rounded-full border px-3 py-1 text-xs transition-colors " +
              (filter === t
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-secondary")
            }
          >
            {t === "all" ? "全部" : DECISION_TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      {loading && <div className="h-64 animate-pulse rounded-md bg-card" />}
      {error && <PageError message={error.message} />}
      {data && (
        <Card className="card-flat">
          <CardContent className="p-0">
            <DecisionListTable decisions={data.decisions} />
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
