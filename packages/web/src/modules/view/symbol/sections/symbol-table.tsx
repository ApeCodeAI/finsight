/**
 * [INPUT]: shared/ui/{table,badge}, shared/lib/format, react-router-dom Link
 * [OUTPUT]: <SymbolTable symbols /> — 标的总览表，按 CNY 市值降序
 * [POS]: view/symbol/sections
 * [RUNTIME]: client
 * [PROTOCOL]: 持仓占比从 portfolio_weight 直接读
 */
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
import { ASSET_CLASS_COLOR, assetClassLabel } from "@/data/asset-class";
import type { SymbolAggregate } from "../data";

export function SymbolTable({ symbols }: { symbols: SymbolAggregate[] }) {
  const totalBase = symbols.reduce((s, x) => s + x.market_value_base, 0);
  const totalPnl = symbols.reduce((s, x) => s + x.pnl_base, 0);

  return (
    <Table>
      <THead>
        <TR>
          <TH>标的</TH>
          <TH>类别</TH>
          <TH>币种</TH>
          <TH className="text-right">账户数</TH>
          <TH className="text-right">总数量</TH>
          <TH className="text-right">市值 (CNY)</TH>
          <TH className="text-right">盈亏 (CNY)</TH>
          <TH className="text-right">收益率</TH>
          <TH className="text-right">占总仓位</TH>
        </TR>
      </THead>
      <TBody>
        {symbols.map((s) => (
          <TR key={s.symbol}>
            <TD>
              <Link
                to={`/symbols/${encodeURIComponent(s.symbol)}`}
                className="font-medium text-foreground hover:text-meta hover:underline"
              >
                {s.symbol}
              </Link>
              {s.name && s.name !== s.symbol && (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {s.name}
                </div>
              )}
            </TD>
            <TD>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="size-2 rounded-sm"
                  style={{ background: ASSET_CLASS_COLOR[s.asset_class] }}
                />
                <span className="text-xs">
                  {assetClassLabel(s.asset_class)}
                </span>
              </span>
            </TD>
            <TD>
              {s.currencies.map((c) => (
                <Badge
                  key={c}
                  variant={c === "CNY" ? "muted" : c === "USD" ? "primary" : "warn"}
                  className="mr-1"
                >
                  {c}
                </Badge>
              ))}
            </TD>
            <TD className="num text-right">
              {s.account_count > 1 ? (
                <span className="font-semibold text-meta">{s.account_count}</span>
              ) : (
                <span className="text-muted">{s.account_count}</span>
              )}
            </TD>
            <TD className="num text-right">{formatNumber(s.total_quantity)}</TD>
            <TD className="num text-right font-medium">
              {formatCurrency(s.market_value_base)}
            </TD>
            <TD className={`num text-right ${pnlClass(s.pnl_base)}`}>
              {signedCurrency(s.pnl_base)}
            </TD>
            <TD className={`num text-right ${pnlClass(s.pnl_base)}`}>
              {formatPercent(s.pnl_pct_base)}
            </TD>
            <TD className="num text-right">
              <WeightBar weight={s.portfolio_weight} />
            </TD>
          </TR>
        ))}
      </TBody>
      <TFoot>
        <TR>
          <TD
            colSpan={5}
            className="text-right text-xs uppercase tracking-wider text-muted"
          >
            合计
          </TD>
          <TD className="num text-right font-semibold">{formatCurrency(totalBase)}</TD>
          <TD className={`num text-right font-semibold ${pnlClass(totalPnl)}`}>
            {signedCurrency(totalPnl)}
          </TD>
          <TD />
          <TD />
        </TR>
      </TFoot>
    </Table>
  );
}

function WeightBar({ weight }: { weight: number }) {
  const pct = Math.max(0, Math.min(1, weight)) * 100;
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="text-xs text-muted">{formatPercent(weight)}</span>
      <div className="relative h-1.5 w-20 overflow-hidden rounded-full bg-[var(--surface-warm)]">
        <div
          className="absolute inset-y-0 left-0 bg-primary"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
