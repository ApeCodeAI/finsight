/**
 * [INPUT]: shared/ui/card, ../data, shared/lib/format
 * [OUTPUT]: <PerformanceCard /> — Overview "整体年化" 卡片
 * [POS]: view/performance/sections
 * [RUNTIME]: client
 * [PROTOCOL]: 无 cashflow 时显示"还没有外部资金流"占位（带 CLI 引导）
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { formatCurrency, formatPercent } from "@/shared/lib/format";
import { usePerformance } from "../data";

export function PerformanceCard() {
  const { data, loading } = usePerformance();
  if (loading || !data) return null;

  const o = data.overall;

  if (o.cashflow_count === 0) {
    return (
      <Card className="card-flat border-l-4 border-l-[var(--meta)]">
        <CardContent className="flex flex-col gap-1 p-5">
          <p className="font-mono text-[11px] uppercase tracking-widest text-meta">
            📈 表现
          </p>
          <p className="text-sm text-muted-foreground">
            还没有外部资金流（deposit/withdraw）记录，无法计算年化。补几笔后
            自动出现 XIRR。可以用{" "}
            <code className="font-mono text-xs">
              finsight import yzyx-batch &lt;dir&gt;
            </code>{" "}
            导入有知有行历史。
          </p>
        </CardContent>
      </Card>
    );
  }

  const xirr = o.xirr;
  const ret = o.total_return;
  const positive = ret >= 0;
  const xirrPositive = xirr != null && xirr >= 0;
  const accentColor = positive
    ? "border-l-[var(--success)]"
    : "border-l-[var(--danger)]";

  return (
    <Card className={"card-flat border-l-4 " + accentColor}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span>📈 整体表现</span>
          <span className="font-mono text-xs text-muted">
            {o.period_start} → {o.period_end}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 p-5 pt-0 md:grid-cols-4">
        <Stat label="累计投入" value={formatCurrency(o.net_deposits, o.currency)} />
        <Stat label="当前价值" value={formatCurrency(o.current_value, o.currency)} />
        <Stat
          label="累计盈亏"
          value={formatCurrency(ret, o.currency)}
          tone={positive ? "success" : "danger"}
          sub={
            o.total_return_pct != null
              ? `${positive ? "+" : ""}${formatPercent(o.total_return_pct)}`
              : undefined
          }
        />
        <Stat
          label="年化 (XIRR)"
          value={xirr != null ? formatPercent(xirr) : "—"}
          tone={xirrPositive ? "success" : "danger"}
        />
      </CardContent>
      <CardContent className="p-5 pt-0">
        <details className="text-sm">
          <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-widest text-meta hover:text-foreground">
            按账户拆分 · {data.accounts.filter((a) => a.cashflow_count > 0).length} 个账户有现金流
          </summary>
          <ul className="mt-3 flex flex-col gap-1.5">
            {data.accounts
              .filter((a) => a.cashflow_count > 0)
              .map((a) => (
                <li
                  key={a.account_id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span>{a.account_name}</span>
                  <span className="flex items-center gap-3 font-mono text-xs">
                    <span className="text-muted">
                      {formatCurrency(a.net_deposits, a.currency)} →{" "}
                      {formatCurrency(a.current_value, a.currency)}
                    </span>
                    <span
                      className={
                        "num " +
                        (a.xirr != null && a.xirr >= 0
                          ? "text-success"
                          : "text-danger")
                      }
                    >
                      {a.xirr != null ? formatPercent(a.xirr) : "—"}
                    </span>
                  </span>
                </li>
              ))}
          </ul>
        </details>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger";
  sub?: string;
}) {
  const toneClass =
    tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
        {label}
      </span>
      <span className={`num text-base font-semibold ${toneClass}`}>{value}</span>
      {sub && <span className={`text-xs ${toneClass}`}>{sub}</span>}
    </div>
  );
}
