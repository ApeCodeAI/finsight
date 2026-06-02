/**
 * [INPUT]: shared/ui/table, shared/lib/format
 * [OUTPUT]: <TransactionList transactions /> — 单账户近期交易
 * [POS]: account 详情页
 * [RUNTIME]: client
 * [PROTOCOL]: 列变化时同步 detail-page.tsx
 */
import { Table, TBody, THead, TH, TR, TD } from "@/shared/ui/table";
import { formatCurrency, formatNumber } from "@/shared/lib/format";
import type { TransactionRow } from "../data";

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

export function TransactionList({ transactions }: { transactions: TransactionRow[] }) {
  const sorted = [...transactions].sort((a, b) => b.traded_at.localeCompare(a.traded_at));
  return (
    <Table>
      <THead>
        <TR>
          <TH>时间</TH>
          <TH>类型</TH>
          <TH className="text-right">数量</TH>
          <TH className="text-right">单价</TH>
          <TH className="text-right">金额</TH>
          <TH>备注</TH>
        </TR>
      </THead>
      <TBody>
        {sorted.slice(0, 25).map((t) => (
          <TR key={t.id}>
            <TD className="font-mono text-xs">{t.traded_at.slice(0, 10)}</TD>
            <TD>{TYPE_LABEL[t.type] ?? t.type}</TD>
            <TD className="num text-right">
              {t.quantity != null ? formatNumber(t.quantity) : "—"}
            </TD>
            <TD className="num text-right">
              {t.price != null ? formatNumber(t.price) : "—"}
            </TD>
            <TD className="num text-right">{formatCurrency(t.amount, t.currency)}</TD>
            <TD className="text-xs text-muted-foreground">{t.notes ?? ""}</TD>
          </TR>
        ))}
        {sorted.length === 0 && (
          <TR>
            <TD colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
              没有交易记录
            </TD>
          </TR>
        )}
      </TBody>
    </Table>
  );
}
