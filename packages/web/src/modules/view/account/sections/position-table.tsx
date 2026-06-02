/**
 * [INPUT]: shared/ui/{table,badge}, shared/lib/format
 * [OUTPUT]: <PositionTable positions /> — 持仓表，按币种分组（港股/美股/基金）
 *           单只持仓的数字用原币种显示，每组末尾给 CNY 估值小计
 * [POS]: account 详情页
 * [RUNTIME]: client
 * [PROTOCOL]: market_value_base 由 server /api/accounts/:id 计算后传入
 */
import { Fragment } from "react";
import { Link } from "react-router-dom";
import { Table, TBody, THead, TH, TR, TD, TFoot } from "@/shared/ui/table";
import { Badge } from "@/shared/ui/badge";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  pnlClass,
  signedCurrency,
} from "@/shared/lib/format";
import type { PositionRow } from "../data";

const CURRENCY_LABEL: Record<string, string> = {
  HKD: "港股",
  USD: "美股",
  CNY: "基金 / A 股",
  EUR: "欧股",
  GBP: "英股",
  JPY: "日股",
};

function currencyLabel(ccy: string): string {
  return CURRENCY_LABEL[ccy] ?? ccy;
}

function groupByCurrency(positions: PositionRow[]): Map<string, PositionRow[]> {
  const out = new Map<string, PositionRow[]>();
  for (const p of positions) {
    const k = p.currency;
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push(p);
  }
  return out;
}

const CURRENCY_ORDER: Record<string, number> = {
  HKD: 0,
  USD: 1,
  CNY: 2,
};

export function PositionTable({ positions }: { positions: PositionRow[] }) {
  if (positions.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        没有持仓。如果是现金类账户，这里本来就是空的。
      </div>
    );
  }

  const groups = Array.from(groupByCurrency(positions).entries()).sort(
    ([a], [b]) =>
      (CURRENCY_ORDER[a] ?? 99) - (CURRENCY_ORDER[b] ?? 99) || a.localeCompare(b),
  );

  return (
    <div className="flex flex-col">
      {groups.map(([currency, rows], idx) => {
        const groupTotalBase = rows.reduce((s, p) => s + p.market_value_base, 0);
        const groupCostBase = rows.reduce((s, p) => s + p.cost_basis_base, 0);
        const groupPnlBase = groupTotalBase - groupCostBase;

        return (
          <Fragment key={currency}>
            <div
              className={
                "flex items-center justify-between px-5 py-3 " +
                (idx === 0 ? "" : "border-t border-border ") +
                "bg-[var(--surface-warm)]"
              }
            >
              <div className="flex items-center gap-2">
                <Badge variant="primary">{currencyLabel(currency)}</Badge>
                <span className="font-mono text-[11px] uppercase tracking-widest text-muted">
                  {currency} · {rows.length} 持仓
                </span>
              </div>
              <div className="flex items-center gap-6 text-xs">
                <span className="text-muted">
                  CNY 市值{" "}
                  <span className="num text-foreground">
                    {formatCurrency(groupTotalBase)}
                  </span>
                </span>
                <span className={pnlClass(groupPnlBase)}>
                  {signedCurrency(groupPnlBase)}
                </span>
              </div>
            </div>
            <Table>
              <THead>
                <TR>
                  <TH>标的</TH>
                  <TH className="text-right">数量</TH>
                  <TH className="text-right">成本</TH>
                  <TH className="text-right">现价</TH>
                  <TH className="text-right">市值 ({currency})</TH>
                  <TH className="text-right">市值 (CNY)</TH>
                  <TH className="text-right">盈亏 ({currency})</TH>
                  <TH className="text-right">收益率</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((p) => (
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
                    <TD className="num text-right">{formatNumber(p.quantity)}</TD>
                    <TD className="num text-right">{formatNumber(p.avg_cost)}</TD>
                    <TD className="num text-right">
                      {formatNumber(p.current_price)}
                    </TD>
                    <TD className="num text-right">
                      {formatCurrency(p.market_value, currency)}
                    </TD>
                    <TD className="num text-right text-muted-foreground">
                      {formatCurrency(p.market_value_base)}
                    </TD>
                    <TD className={`num text-right ${pnlClass(p.pnl)}`}>
                      {signedCurrency(p.pnl, currency)}
                    </TD>
                    <TD className={`num text-right ${pnlClass(p.pnl)}`}>
                      {formatPercent(p.pnl_pct)}
                    </TD>
                  </TR>
                ))}
              </TBody>
              <TFoot>
                <TR>
                  <TD
                    colSpan={4}
                    className="text-right text-xs uppercase tracking-wider text-muted"
                  >
                    {currencyLabel(currency)} 小计
                  </TD>
                  <TD className="num text-right">
                    {formatCurrency(
                      rows.reduce((s, p) => s + p.market_value, 0),
                      currency,
                    )}
                  </TD>
                  <TD className="num text-right font-semibold">
                    {formatCurrency(groupTotalBase)}
                  </TD>
                  <TD
                    className={`num text-right font-semibold ${pnlClass(groupPnlBase)}`}
                  >
                    {signedCurrency(groupPnlBase)}
                  </TD>
                  <TD className="num text-right text-muted-foreground">
                    {groupCostBase !== 0
                      ? formatPercent(groupPnlBase / groupCostBase)
                      : "—"}
                  </TD>
                </TR>
              </TFoot>
            </Table>
          </Fragment>
        );
      })}
    </div>
  );
}
