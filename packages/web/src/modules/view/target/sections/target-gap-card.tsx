/**
 * [INPUT]: shared/ui/card, ../data (useTargetCheck), shared/lib/format, react-router Link
 * [OUTPUT]: <TargetGapCard /> — Overview "目标 vs 现状" 卡片
 * [POS]: view/target/sections
 * [RUNTIME]: client
 * [PROTOCOL]: 无 active target / 404 → 显示"未设置目标"占位（带 CLI 引导）
 */
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { formatCurrency, formatPercent } from "@/shared/lib/format";
import { useTargetCheck } from "../data";

export function TargetGapCard() {
  const { data, error, loading } = useTargetCheck();

  if (loading) return null;

  // No active target → friendly nudge
  if (error || !data) {
    return (
      <Card className="card-flat border-l-4 border-l-[var(--meta)]">
        <CardContent className="flex flex-col gap-1 p-5">
          <p className="font-mono text-[11px] uppercase tracking-widest text-meta">
            🎯 目标配置
          </p>
          <p className="text-sm text-muted-foreground">
            还没设置目标。建议用{" "}
            <code className="font-mono text-xs">
              finsight target add --name balanced --alloc us-stock=0.3,a-stock=0.2,fund=0.2,cash=0.2,crypto=0.1 --active
            </code>{" "}
            创建一份。
          </p>
        </CardContent>
      </Card>
    );
  }

  const off = data.gaps.filter((g) => g.status !== "on_target");
  const top = (off.length > 0 ? off : data.gaps).slice(0, 5);
  const allOnTarget = off.length === 0;

  return (
    <Card
      className={
        "card-flat border-l-4 " +
        (allOnTarget
          ? "border-l-[var(--success)]"
          : "border-l-[var(--warn)]")
      }
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span>
            🎯 目标 · <span className="font-mono text-meta">{data.target_name}</span>
          </span>
          <span className="font-mono text-xs text-muted">
            max drift {(data.max_drift * 100).toFixed(1)}pp
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 p-5 pt-0">
        {allOnTarget && (
          <p className="text-sm text-success">✓ 所有类目都在容忍区间内。</p>
        )}
        <ul className="flex flex-col gap-1.5 text-sm">
          {top.map((g) => (
            <li
              key={g.asset_class}
              className="flex items-center justify-between gap-3"
            >
              <span className="flex items-center gap-2">
                <StatusDot status={g.status} />
                <span>{g.label}</span>
                <span className="font-mono text-[11px] text-muted">
                  {formatPercent(g.current_weight)} /{" "}
                  {formatPercent(g.target_weight)}
                </span>
              </span>
              <span
                className={
                  "num font-mono text-xs " +
                  (g.gap_weight > 0 ? "text-danger" : "text-success")
                }
              >
                {g.gap_weight > 0 ? "+" : ""}
                {(g.gap_weight * 100).toFixed(1)}pp ·{" "}
                {formatCurrency(g.gap_value_base, data.base_currency)}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-muted-foreground">
          <Link to="/analytics" className="hover:text-meta hover:underline">
            打开分析 →
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

function StatusDot({ status }: { status: "under" | "over" | "on_target" }) {
  const color =
    status === "on_target"
      ? "bg-success"
      : status === "under"
        ? "bg-warn"
        : "bg-danger";
  return <span className={`inline-block size-2 rounded-full ${color}`} />;
}
