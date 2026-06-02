/**
 * [INPUT]: ./data (usePerformance), shared/ui, shared/lib/format, shared/layout/page-shell
 * [OUTPUT]: <PerformancePage /> — /performance 全页（per-account 表 + overall hero）
 * [POS]: modules/view/performance/page.tsx
 * [RUNTIME]: client
 * [PROTOCOL]: 数据 schema 与 server /api/performance 对齐
 */
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/shared/ui/card";
import { Table, TBody, THead, TH, TR, TD } from "@/shared/ui/table";
import { PageError, PageShell } from "@/shared/layout/page-shell";
import { formatCurrency, formatPercent } from "@/shared/lib/format";
import { usePerformance, type PerformanceRow } from "./data";

function periodLabel(r: { days: number }): string {
  if (r.days <= 0) return "—";
  const y = r.days / 365;
  if (y >= 1) return `${y.toFixed(1)}y`;
  const m = r.days / 30;
  if (m >= 1) return `${m.toFixed(1)}m`;
  return `${r.days}d`;
}

function xirrColor(r: number | null): string {
  if (r == null) return "text-muted";
  return r >= 0 ? "text-success" : "text-danger";
}

export function PerformancePage() {
  const { data, error, loading } = usePerformance();

  if (loading) {
    return (
      <PageShell eyebrow="PERFORMANCE" title="加载中">
        <div className="h-64 animate-pulse rounded-md bg-card" />
      </PageShell>
    );
  }
  if (error) {
    return (
      <PageShell eyebrow="PERFORMANCE" title="表现">
        <PageError message={error.message} />
      </PageShell>
    );
  }
  if (!data) return null;

  const overall = data.overall;
  const hasAnyFlow = data.accounts.some((a) => a.cashflow_count > 0);

  return (
    <PageShell
      eyebrow="PERFORMANCE"
      title="资产表现"
      subtitle="money-weighted return (XIRR) — 用每笔 deposit / withdraw 和当前价值算出的真实年化"
    >
      {!hasAnyFlow ? (
        <Card className="card-flat border-l-4 border-l-[var(--meta)]">
          <CardContent className="flex flex-col gap-2 p-6">
            <p className="font-mono text-[11px] uppercase tracking-widest text-meta">
              ⏱ 还没有现金流可计算
            </p>
            <p className="text-sm text-muted-foreground">
              录入几笔 deposit / withdraw 后再回来 —— 一般需要 3 个月以上数据，
              XIRR 才有意义。
            </p>
            <pre className="overflow-x-auto rounded-md bg-secondary p-3 font-mono text-xs">
              finsight trade deposit 招商银行 30000 --date 2026-06-15 --note "salary"{"\n"}
              finsight trade withdraw 招商银行 8000 --date 2026-06-20 --note "rent"
            </pre>
          </CardContent>
        </Card>
      ) : (
        <OverallHero overall={overall} />
      )}

      <Card className="card-flat">
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>账户</TH>
                <TH>区间</TH>
                <TH className="text-right">累计投入</TH>
                <TH className="text-right">当前价值</TH>
                <TH className="text-right">盈亏</TH>
                <TH className="text-right">总收益率</TH>
                <TH className="text-right">XIRR (年化)</TH>
              </TR>
            </THead>
            <TBody>
              {data.accounts.map((r) => (
                <AccountRow key={r.account_id} row={r} />
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        ⚠ 部分账户没有 deposit / withdraw 记录（cashflow_count = 0）时，
        portfolio-wide XIRR 会偏离真实值，因为这些账户的当前余额会被当作
        「凭空冒出来的回报」算进去。建议把工资 / 大额消费都记下来，或者参考{" "}
        <Link to="/decisions" className="text-meta underline">
          决策日志
        </Link>{" "}
        手动加批注。
      </p>
    </PageShell>
  );
}

function OverallHero({ overall }: { overall: PerformanceRow }) {
  const positive = overall.total_return >= 0;
  return (
    <Card
      className={
        "card-raised border-l-4 " +
        (positive ? "border-l-[var(--success)]" : "border-l-[var(--danger)]")
      }
    >
      <CardContent className="grid grid-cols-2 gap-4 p-6 md:grid-cols-4">
        <Stat
          label="累计投入"
          value={formatCurrency(overall.net_deposits, overall.currency)}
        />
        <Stat
          label="当前价值"
          value={formatCurrency(overall.current_value, overall.currency)}
        />
        <Stat
          label="累计盈亏"
          value={formatCurrency(overall.total_return, overall.currency)}
          tone={positive ? "success" : "danger"}
          sub={
            overall.total_return_pct != null
              ? `${positive ? "+" : ""}${formatPercent(overall.total_return_pct)}`
              : undefined
          }
        />
        <Stat
          label="年化 (XIRR)"
          value={overall.xirr != null ? formatPercent(overall.xirr) : "—"}
          tone={
            overall.xirr != null && overall.xirr >= 0 ? "success" : "danger"
          }
          sub={
            overall.days > 0
              ? `${overall.period_start} → ${overall.period_end} (${periodLabel(overall)})`
              : undefined
          }
        />
      </CardContent>
    </Card>
  );
}

function AccountRow({ row }: { row: PerformanceRow }) {
  const isFlat = row.cashflow_count === 0 && row.current_value === 0;
  if (isFlat) return null;
  const totalReturnColor =
    row.total_return > 0
      ? "text-success"
      : row.total_return < 0
        ? "text-danger"
        : "text-muted";
  return (
    <TR>
      <TD>
        {row.account_id ? (
          <Link
            to={`/accounts/${row.account_id}`}
            className="text-foreground hover:text-meta hover:underline"
          >
            {row.account_name}
          </Link>
        ) : (
          row.account_name
        )}
      </TD>
      <TD className="font-mono text-xs">
        {row.cashflow_count === 0 ? "—" : periodLabel(row)}
      </TD>
      <TD className="num text-right">
        {row.cashflow_count === 0
          ? "—"
          : formatCurrency(row.net_deposits, row.currency)}
      </TD>
      <TD className="num text-right">
        {formatCurrency(row.current_value, row.currency)}
      </TD>
      <TD className={`num text-right ${totalReturnColor}`}>
        {row.cashflow_count === 0
          ? "—"
          : formatCurrency(row.total_return, row.currency)}
      </TD>
      <TD className={`num text-right ${totalReturnColor}`}>
        {row.total_return_pct != null
          ? formatPercent(row.total_return_pct)
          : "—"}
      </TD>
      <TD className={`num text-right ${xirrColor(row.xirr)}`}>
        {row.xirr != null
          ? formatPercent(row.xirr)
          : row.cashflow_count === 0
            ? "no cashflows"
            : "—"}
      </TD>
    </TR>
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
    tone === "success"
      ? "text-success"
      : tone === "danger"
        ? "text-danger"
        : "";
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
        {label}
      </span>
      <span className={`num text-lg font-semibold md:text-xl ${toneClass}`}>
        {value}
      </span>
      {sub && (
        <span className={`text-xs ${toneClass || "text-muted-foreground"}`}>
          {sub}
        </span>
      )}
    </div>
  );
}
