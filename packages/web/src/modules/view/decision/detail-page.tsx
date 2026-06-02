/**
 * [INPUT]: react-router-dom useParams + Link, ./data, shared/layout/page-shell
 * [OUTPUT]: <DecisionDetailPage /> — /decisions/:id
 * [POS]: modules/view/decision/detail-page.tsx
 * [RUNTIME]: client
 * [PROTOCOL]: body 渲染为 pre 块（无 MD 渲染器，保留原始 markdown 可读）
 */
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { PageEmpty, PageError, PageShell } from "@/shared/layout/page-shell";
import { useDecision } from "./data";
import {
  DECISION_TYPE_LABEL,
  DECISION_TYPE_VARIANT,
} from "./sections/decision-list-table";

export function DecisionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading } = useDecision(id);

  if (loading) {
    return (
      <PageShell eyebrow="DECISION" title="加载中">
        <div className="h-64 animate-pulse rounded-md bg-card" />
      </PageShell>
    );
  }
  if (error) {
    return (
      <PageShell eyebrow="DECISION" title="出错">
        <PageError message={error.message} />
      </PageShell>
    );
  }
  if (!data || !("id" in data)) {
    return (
      <PageShell eyebrow="DECISION" title="未找到">
        <PageEmpty message="该决策不存在或已被删除" />
      </PageShell>
    );
  }

  const d = data;
  return (
    <PageShell
      eyebrow={`DECISION · ${d.date} · ${d.type}`}
      title={
        <span className="flex items-center gap-3">
          <Link to="/decisions" className="text-muted-foreground hover:text-meta">
            <ArrowLeft className="size-5" />
          </Link>
          {d.title}
        </span>
      }
    >
      <Card className="card-raised">
        <CardContent className="flex flex-col gap-4 p-6">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={DECISION_TYPE_VARIANT[d.type]}>
              {DECISION_TYPE_LABEL[d.type]}
            </Badge>
            {d.conviction && (
              <span className="font-mono text-[11px] uppercase tracking-widest text-muted">
                conviction: {d.conviction}
              </span>
            )}
            {d.horizon && (
              <span className="font-mono text-[11px] uppercase tracking-widest text-muted">
                horizon: {d.horizon}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {d.symbols.length > 0 && (
              <Field
                label="标的"
                value={
                  <span className="flex flex-wrap gap-2">
                    {d.symbols.map((s) => (
                      <Link
                        key={s}
                        to={`/symbols/${encodeURIComponent(s)}`}
                        className="font-mono text-sm text-meta hover:underline"
                      >
                        {s}
                      </Link>
                    ))}
                  </span>
                }
              />
            )}
            {d.exit_target != null && (
              <Field label="目标价 (exit)" value={<span className="num">{d.exit_target}</span>} />
            )}
            {d.stop_loss != null && (
              <Field label="止损 (stop)" value={<span className="num">{d.stop_loss}</span>} />
            )}
            {d.transaction_id && (
              <Field
                label="关联交易"
                value={<span className="font-mono text-xs">{d.transaction_id.slice(-12)}</span>}
              />
            )}
            {d.accounts.length > 0 && (
              <Field
                label="账户"
                value={
                  <span className="flex flex-wrap gap-2">
                    {d.accounts.map((a) => (
                      <Link
                        key={a}
                        to={`/accounts/${a}`}
                        className="text-sm text-meta hover:underline"
                      >
                        {a.slice(-8)}
                      </Link>
                    ))}
                  </span>
                }
              />
            )}
            {d.tags.length > 0 && (
              <Field
                label="标签"
                value={
                  <span className="flex flex-wrap gap-1">
                    {d.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-md bg-secondary px-2 py-0.5 text-xs"
                      >
                        {t}
                      </span>
                    ))}
                  </span>
                }
              />
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="card-flat">
        <CardHeader>
          <CardTitle>正文</CardTitle>
        </CardHeader>
        <CardContent>
          {d.body ? (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
              {d.body}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">
              （没有正文。CLI 改：
              <code className="font-mono text-xs">
                finsight decision edit {d.id.slice(-12)} --body "..."
              </code>
              ）
            </p>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        ID: <code className="font-mono">{d.id}</code> · 创建 {d.created_at} · 更新 {d.updated_at}
      </p>
    </PageShell>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
        {label}
      </span>
      <span className="text-sm">{value}</span>
    </div>
  );
}
