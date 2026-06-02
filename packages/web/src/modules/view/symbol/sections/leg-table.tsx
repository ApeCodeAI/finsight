/**
 * [INPUT]: shared/ui/table, shared/lib/format, react-router-dom Link
 * [OUTPUT]: <LegTable legs /> — 标的的跨账户细分（按 CNY 市值降序）
 * [POS]: symbol/sections
 * [RUNTIME]: client
 * [PROTOCOL]: 同 symbol 但不同 currency 的 leg 也允许出现
 */
import { Link } from "react-router-dom";
import { Table, TBody, THead, TH, TR, TD } from "@/shared/ui/table";
import { Badge } from "@/shared/ui/badge";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  pnlClass,
  signedCurrency,
} from "@/shared/lib/format";
import type { SymbolAccountLeg } from "../data";

export function LegTable({ legs }: { legs: SymbolAccountLeg[] }) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>账户</TH>
          <TH>币种</TH>
          <TH className="text-right">数量</TH>
          <TH className="text-right">成本</TH>
          <TH className="text-right">现价</TH>
          <TH className="text-right">市值</TH>
          <TH className="text-right">市值 (CNY)</TH>
          <TH className="text-right">盈亏 (CNY)</TH>
          <TH className="text-right">收益率</TH>
        </TR>
      </THead>
      <TBody>
        {legs.map((l) => (
          <TR key={l.position_id}>
            <TD>
              <Link
                to={`/accounts/${l.account_id}`}
                className="font-medium text-foreground hover:text-meta hover:underline"
              >
                {l.account_name}
              </Link>
            </TD>
            <TD>
              <Badge
                variant={
                  l.currency === "CNY"
                    ? "muted"
                    : l.currency === "USD"
                      ? "primary"
                      : "warn"
                }
              >
                {l.currency}
              </Badge>
            </TD>
            <TD className="num text-right">{formatNumber(l.quantity)}</TD>
            <TD className="num text-right">{formatNumber(l.avg_cost)}</TD>
            <TD className="num text-right">{formatNumber(l.current_price)}</TD>
            <TD className="num text-right">
              {formatCurrency(l.market_value, l.currency)}
            </TD>
            <TD className="num text-right text-muted-foreground">
              {formatCurrency(l.market_value_base)}
            </TD>
            <TD className={`num text-right ${pnlClass(l.pnl_base)}`}>
              {signedCurrency(l.pnl_base)}
            </TD>
            <TD className={`num text-right ${pnlClass(l.pnl)}`}>
              {formatPercent(l.pnl_pct)}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
