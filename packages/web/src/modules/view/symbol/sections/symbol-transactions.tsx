/**
 * [INPUT]: shared/ui/{table,badge}, shared/lib/format, react-router-dom Link
 * [OUTPUT]: <SymbolTransactions transactions /> — 该标的的跨账户交易历史
 * [POS]: symbol/sections — 与 account 详情页的 TransactionList 视角呼应
 * [RUNTIME]: client
 * [PROTOCOL]: 同一笔交易会同时出现在 account 详情和 symbol 详情中
 */
import { Link } from "react-router-dom";
import { Table, TBody, THead, TH, TR, TD } from "@/shared/ui/table";
import { Badge } from "@/shared/ui/badge";
import {
  formatCurrency,
  formatNumber,
} from "@/shared/lib/format";
import type { SymbolTransaction } from "../data";

const TYPE_LABEL: Record<string, string> = {
  buy: "买入",
  sell: "卖出",
  deposit: "转入",
  withdraw: "转出",
  transfer_in: "内转入",
  transfer_out: "内转出",
  dividend: "分红",
  interest: "利息",
};

const TYPE_VARIANT: Record<string, "success" | "danger" | "muted" | "primary"> = {
  buy: "success",
  sell: "danger",
  dividend: "primary",
  interest: "primary",
};

export function SymbolTransactions({
  transactions,
}: {
  transactions: SymbolTransaction[];
}) {
  if (transactions.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        还没有该标的的交易记录。
        <br />
        <span className="font-mono text-xs">
          finsight trade buy &lt;account&gt; &lt;symbol&gt; &lt;qty&gt; &lt;price&gt;
        </span>{" "}
        会让交易同时显示在这里和账户详情。
      </div>
    );
  }
  return (
    <Table>
      <THead>
        <TR>
          <TH>时间</TH>
          <TH>类型</TH>
          <TH>账户</TH>
          <TH className="text-right">数量</TH>
          <TH className="text-right">单价</TH>
          <TH className="text-right">金额</TH>
          <TH className="text-right">手续费</TH>
          <TH>备注</TH>
        </TR>
      </THead>
      <TBody>
        {transactions.map((t) => (
          <TR key={t.id}>
            <TD className="font-mono text-xs">{t.traded_at.slice(0, 10)}</TD>
            <TD>
              <Badge variant={TYPE_VARIANT[t.type] ?? "muted"}>
                {TYPE_LABEL[t.type] ?? t.type}
              </Badge>
            </TD>
            <TD>
              {t.account_name && (
                <Link
                  to={`/accounts/${t.account_id}`}
                  className="text-sm text-meta hover:underline"
                >
                  {t.account_name}
                </Link>
              )}
            </TD>
            <TD className="num text-right">
              {t.quantity != null ? formatNumber(t.quantity) : "—"}
            </TD>
            <TD className="num text-right">
              {t.price != null ? formatNumber(t.price) : "—"}
            </TD>
            <TD className="num text-right">
              {formatCurrency(t.amount, t.currency)}
            </TD>
            <TD className="num text-right text-muted-foreground">
              {t.fee > 0 ? formatCurrency(t.fee, t.currency) : "—"}
            </TD>
            <TD className="text-xs text-muted-foreground">{t.notes ?? ""}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
