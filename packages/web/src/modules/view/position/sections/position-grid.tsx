/**
 * [INPUT]: shared/ui/{table,badge}, shared/lib/format, data/asset-class, react-router-dom Link
 * [OUTPUT]: <PositionGrid positions totalNetWorthBase /> — 跨账户持仓按资产类别分组
 * [POS]: view/position/sections
 * [RUNTIME]: client
 * [PROTOCOL]: 类别从 server 传入的 asset_class 字段读，不在前端二次判断
 */
import { Fragment } from "react";
import { Link } from "react-router-dom";
import { Table, TBody, THead, TH, TR, TD } from "@/shared/ui/table";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  pnlClass,
  signedCurrency,
} from "@/shared/lib/format";
import {
  ASSET_CLASS_COLOR,
  assetClassLabel,
  assetClassRank,
} from "@/data/asset-class";
import type { AssetClass, PositionListRow } from "../data";

function groupByClass(
  positions: PositionListRow[],
): Map<AssetClass, PositionListRow[]> {
  const out = new Map<AssetClass, PositionListRow[]>();
  for (const p of positions) {
    if (!out.has(p.asset_class)) out.set(p.asset_class, []);
    out.get(p.asset_class)!.push(p);
  }
  return out;
}

export function PositionGrid({
  positions,
  totalNetWorthBase,
}: {
  positions: PositionListRow[];
  totalNetWorthBase: number;
}) {
  const groups = Array.from(groupByClass(positions).entries()).sort(
    ([a], [b]) => assetClassRank(a) - assetClassRank(b),
  );

  return (
    <div className="flex flex-col gap-6">
      {groups.map(([cls, rows]) => {
        const valueBase = rows.reduce((s, p) => s + p.market_value_base, 0);
        const costBase = rows.reduce((s, p) => s + p.cost_basis_base, 0);
        const pnlCny = valueBase - costBase;
        const weight = totalNetWorthBase > 0 ? valueBase / totalNetWorthBase : 0;
        const pnlPct = costBase !== 0 ? pnlCny / costBase : 0;

        const byCcy = new Map<string, PositionListRow[]>();
        for (const r of rows) {
          if (!byCcy.has(r.currency)) byCcy.set(r.currency, []);
          byCcy.get(r.currency)!.push(r);
        }
        const ccyGroups = Array.from(byCcy.entries()).sort();

        return (
          <section
            key={cls}
            className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-card"
          >
            <header className="flex flex-col gap-3 border-b border-border bg-[var(--surface-warm)] px-5 py-4 md:flex-row md:items-end md:justify-between">
              <div className="flex items-center gap-3">
                <span
                  className="size-3 rounded-sm"
                  style={{ background: ASSET_CLASS_COLOR[cls] }}
                />
                <h3 className="font-display text-lg font-semibold">
                  {assetClassLabel(cls)}
                </h3>
                <span className="font-mono text-[11px] uppercase tracking-widest text-muted">
                  {rows.length} 持仓 · {new Set(rows.map((r) => r.symbol)).size} 标的
                </span>
              </div>
              <div className="grid grid-cols-3 gap-6 text-sm md:gap-10">
                <Metric
                  label="CNY 市值"
                  value={formatCurrency(valueBase)}
                  highlight
                />
                <Metric
                  label="盈亏"
                  value={signedCurrency(pnlCny)}
                  sub={formatPercent(pnlPct)}
                  className={pnlClass(pnlCny)}
                />
                <Metric label="占总仓位" value={formatPercent(weight)} />
              </div>
            </header>

            {ccyGroups.map(([ccy, ccyRows]) => (
              <Fragment key={ccy}>
                {ccyGroups.length > 1 && (
                  <div className="border-b border-border bg-card px-5 py-2 text-[11px] font-mono uppercase tracking-widest text-muted">
                    {ccy} · {ccyRows.length} 持仓
                  </div>
                )}
                <Table>
                  <THead>
                    <TR>
                      <TH>标的</TH>
                      <TH>账户</TH>
                      <TH className="text-right">数量</TH>
                      <TH className="text-right">成本</TH>
                      <TH className="text-right">现价</TH>
                      <TH className="text-right">市值 ({ccy})</TH>
                      <TH className="text-right">市值 (CNY)</TH>
                      <TH className="text-right">盈亏 (CNY)</TH>
                      <TH className="text-right">%</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {ccyRows
                      .sort((a, b) => b.market_value_base - a.market_value_base)
                      .map((p) => (
                        <TR key={p.id}>
                          <TD>
                            <Link
                              to={`/symbols/${encodeURIComponent(p.symbol)}`}
                              className="font-medium text-foreground hover:text-meta hover:underline"
                            >
                              {p.symbol}
                            </Link>
                            {p.name && (
                              <div className="text-xs text-muted-foreground">
                                {p.name}
                              </div>
                            )}
                          </TD>
                          <TD>
                            {p.account_name && (
                              <Link
                                to={`/accounts/${p.account_id}`}
                                className="text-sm text-meta hover:underline"
                              >
                                {p.account_name}
                              </Link>
                            )}
                          </TD>
                          <TD className="num text-right">
                            {formatNumber(p.quantity)}
                          </TD>
                          <TD className="num text-right">
                            {formatNumber(p.avg_cost)}
                          </TD>
                          <TD className="num text-right">
                            {formatNumber(p.current_price)}
                          </TD>
                          <TD className="num text-right">
                            {formatCurrency(p.market_value, p.currency)}
                          </TD>
                          <TD className="num text-right text-muted-foreground">
                            {formatCurrency(p.market_value_base)}
                          </TD>
                          <TD className={`num text-right ${pnlClass(p.pnl_base)}`}>
                            {signedCurrency(p.pnl_base)}
                          </TD>
                          <TD className={`num text-right ${pnlClass(p.pnl)}`}>
                            {formatPercent(p.pnl_pct)}
                          </TD>
                        </TR>
                      ))}
                  </TBody>
                </Table>
              </Fragment>
            ))}

            <footer className="flex items-center justify-between border-t border-border bg-card px-5 py-3 text-sm">
              <span className="text-xs uppercase tracking-wider text-muted">
                {assetClassLabel(cls)} 合计
              </span>
              <div className="flex items-center gap-8">
                <span className="num text-foreground">
                  {formatCurrency(valueBase)}
                </span>
                <span className={`num font-semibold ${pnlClass(pnlCny)}`}>
                  {signedCurrency(pnlCny)} ({formatPercent(pnlPct)})
                </span>
                <span className="num text-xs text-muted">
                  {formatPercent(weight)}
                </span>
              </div>
            </footer>
          </section>
        );
      })}
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  highlight,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
        {label}
      </span>
      <span
        className={`num ${highlight ? "text-base font-semibold" : "text-sm"} ${className ?? ""}`}
      >
        {value}
      </span>
      {sub && <span className={`text-xs ${className ?? "text-muted"}`}>{sub}</span>}
    </div>
  );
}
