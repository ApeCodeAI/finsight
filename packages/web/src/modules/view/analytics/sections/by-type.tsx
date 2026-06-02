/**
 * [INPUT]: shared/ui/{card,table}, shared/lib/format, data/account-type
 * [OUTPUT]: <ByType breakdown /> — 按账户类型的净值分布
 * [POS]: analytics/sections
 * [RUNTIME]: client
 * [PROTOCOL]: 字段改动时同步 page.tsx
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Table, TBody, THead, TH, TR, TD, TFoot } from "@/shared/ui/table";
import { formatCurrency, formatPercent } from "@/shared/lib/format";
import { accountTypeLabel } from "@/data/account-type";
import type { NetWorthBreakdown } from "../data";

export function ByType({ breakdown }: { breakdown: NetWorthBreakdown }) {
  const byType = new Map<string, number>();
  for (const a of breakdown.byAccount) {
    byType.set(a.type, (byType.get(a.type) ?? 0) + a.balance_base);
  }
  const rows = Array.from(byType.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([type, total]) => ({
      type,
      total,
      ratio: breakdown.total !== 0 ? total / breakdown.total : 0,
    }));

  return (
    <Card className="card-flat">
      <CardHeader>
        <CardTitle>按类型聚合</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <THead>
            <TR>
              <TH>类型</TH>
              <TH className="text-right">CNY 估值</TH>
              <TH className="text-right">占比</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.type}>
                <TD>{accountTypeLabel(r.type)}</TD>
                <TD className="num text-right">{formatCurrency(r.total)}</TD>
                <TD className="num text-right text-muted-foreground">
                  {formatPercent(r.ratio)}
                </TD>
              </TR>
            ))}
          </TBody>
          {rows.length > 0 && (
            <TFoot>
              <TR>
                <TD className="text-xs uppercase tracking-wider text-muted">合计</TD>
                <TD className="num text-right font-semibold">
                  {formatCurrency(breakdown.total)}
                </TD>
                <TD className="num text-right">100.00%</TD>
              </TR>
            </TFoot>
          )}
        </Table>
      </CardContent>
    </Card>
  );
}
