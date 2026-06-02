/**
 * [INPUT]: ./data (useTargets, useTargetCheck), shared/ui, format
 * [OUTPUT]: <TargetsPage /> — /targets 全页
 * [POS]: modules/view/target/page.tsx
 * [RUNTIME]: client
 * [PROTOCOL]: 改 schema 时同步 server /api/targets
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Table, TBody, THead, TH, TR, TD } from "@/shared/ui/table";
import { Badge } from "@/shared/ui/badge";
import { PageError, PageShell } from "@/shared/layout/page-shell";
import { formatCurrency, formatPercent } from "@/shared/lib/format";
import { useTargets, useTargetCheck } from "./data";

export function TargetsPage() {
  const { data: list, loading: loadingList, error } = useTargets();
  const { data: check } = useTargetCheck();

  if (loadingList) {
    return (
      <PageShell eyebrow="TARGETS" title="加载中">
        <div className="h-64 animate-pulse rounded-md bg-card" />
      </PageShell>
    );
  }
  if (error) {
    return (
      <PageShell eyebrow="TARGETS" title="目标配置">
        <PageError message={error.message} />
      </PageShell>
    );
  }
  if (!list) return null;

  const active = list.active;

  return (
    <PageShell
      eyebrow="TARGETS"
      title="目标配置 vs 现状"
      subtitle="定义理想资产类别分配，自动算出偏离 (drift) 和回归建议"
    >
      {!active ? (
        <EmptyState />
      ) : (
        <>
          <ActiveCard active={active} check={check} />
          {check && (
            <Card className="card-flat">
              <CardHeader>
                <CardTitle>类目偏离</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <THead>
                    <TR>
                      <TH>类目</TH>
                      <TH className="text-right">目标</TH>
                      <TH className="text-right">当前</TH>
                      <TH className="text-right">Δ %</TH>
                      <TH className="text-right">Δ 金额</TH>
                      <TH>状态</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {check.gaps.map((g) => {
                      const statusColor =
                        g.status === "on_target"
                          ? "success"
                          : g.status === "under"
                            ? "warn"
                            : "danger";
                      return (
                        <TR key={g.asset_class}>
                          <TD>{g.label}</TD>
                          <TD className="num text-right">
                            {formatPercent(g.target_weight)}
                          </TD>
                          <TD className="num text-right">
                            {formatPercent(g.current_weight)}
                          </TD>
                          <TD
                            className={
                              "num text-right " +
                              (g.gap_weight > 0
                                ? "text-danger"
                                : g.gap_weight < 0
                                  ? "text-warn"
                                  : "text-muted")
                            }
                          >
                            {(g.gap_weight * 100).toFixed(1)}pp
                          </TD>
                          <TD className="num text-right">
                            {formatCurrency(g.gap_value_base, check.base_currency)}
                          </TD>
                          <TD>
                            <Badge variant={statusColor}>
                              {g.status === "on_target"
                                ? "达标"
                                : g.status === "under"
                                  ? "低配"
                                  : "超配"}
                            </Badge>
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {list.targets.length > 1 && (
        <Card className="card-flat">
          <CardHeader>
            <CardTitle>所有目标 ({list.targets.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>名称</TH>
                  <TH>状态</TH>
                  <TH>分配</TH>
                  <TH>ID</TH>
                </TR>
              </THead>
              <TBody>
                {list.targets.map((t) => (
                  <TR key={t.id}>
                    <TD>{t.name}</TD>
                    <TD>
                      {t.is_active ? (
                        <Badge variant="success">active</Badge>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </TD>
                    <TD className="font-mono text-xs">
                      {t.allocations
                        .map(
                          (a) =>
                            `${a.asset_class}=${(a.weight * 100).toFixed(0)}%`,
                        )
                        .join(" · ")}
                    </TD>
                    <TD className="font-mono text-xs text-muted">
                      {t.id.slice(-12)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <CliHint />
    </PageShell>
  );
}

function ActiveCard({
  active,
  check,
}: {
  active: NonNullable<ReturnType<typeof useTargets>["data"]>["active"];
  check: ReturnType<typeof useTargetCheck>["data"];
}) {
  if (!active) return null;
  const allOnTarget = check
    ? check.gaps.every((g) => g.status === "on_target")
    : false;
  const accent = allOnTarget
    ? "border-l-[var(--success)]"
    : "border-l-[var(--warn)]";
  return (
    <Card className={"card-raised border-l-4 " + accent}>
      <CardContent className="flex flex-col gap-3 p-6 md:p-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-meta">
              🎯 ACTIVE TARGET
            </p>
            <p className="mt-1 text-2xl font-semibold">{active.name}</p>
          </div>
          {check && (
            <div className="text-right">
              <p className="font-mono text-[11px] uppercase tracking-widest text-muted">
                max drift
              </p>
              <p
                className={
                  "num text-2xl font-semibold " +
                  (check.max_drift < 0.02
                    ? "text-success"
                    : check.max_drift < 0.05
                      ? "text-warn"
                      : "text-danger")
                }
              >
                {(check.max_drift * 100).toFixed(1)}pp
              </p>
            </div>
          )}
        </div>
        {active.notes && (
          <p className="text-sm text-muted-foreground">{active.notes}</p>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card className="card-flat border-l-4 border-l-[var(--meta)]">
      <CardContent className="flex flex-col gap-3 p-6">
        <p className="font-mono text-[11px] uppercase tracking-widest text-meta">
          🎯 还没有 active target
        </p>
        <p className="text-sm text-muted-foreground">
          先在 CLI 里定义一个理想分配，FinSight 自动算出偏离：
        </p>
        <pre className="overflow-x-auto rounded-md bg-secondary p-3 font-mono text-xs">
          finsight target add --name balanced --active \{"\n"}{"  "}--alloc us-stock=0.3,a-stock=0.2,fund=0.2,cash=0.2,crypto=0.1
        </pre>
      </CardContent>
    </Card>
  );
}

function CliHint() {
  return (
    <p className="text-xs text-muted-foreground">
      用 CLI 编辑：{" "}
      <code className="font-mono">finsight target edit &lt;id&gt; --alloc ...</code>{" "}
      ·{" "}
      <code className="font-mono">finsight target use &lt;id&gt;</code>{" "}
      切换 active ·{" "}
      <code className="font-mono">finsight target check --json</code> 给 AI 看
    </p>
  );
}
