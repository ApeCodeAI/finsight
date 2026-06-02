/**
 * [INPUT]: shared/ui/{card,table}, shared/lib/format
 * [OUTPUT]: <ByCurrency breakdown /> — 按币种分布
 * [POS]: analytics/sections
 * [RUNTIME]: client
 * [PROTOCOL]: 不要在此换算汇率；balance_base 由 server 算
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Table, TBody, THead, TH, TR, TD } from "@/shared/ui/table";
import { formatCurrency, formatPercent } from "@/shared/lib/format";
import type { NetWorthBreakdown } from "../data";

export function ByCurrency({ breakdown }: { breakdown: NetWorthBreakdown }) {
  const byCurrency = new Map<string, { native: number; cny: number }>();
  for (const a of breakdown.byAccount) {
    const prev = byCurrency.get(a.currency) ?? { native: 0, cny: 0 };
    byCurrency.set(a.currency, {
      native: prev.native + a.balance,
      cny: prev.cny + a.balance_base,
    });
  }
  const rows = Array.from(byCurrency.entries())
    .sort((a, b) => b[1].cny - a[1].cny)
    .map(([currency, { native, cny }]) => ({
      currency,
      native,
      cny,
      ratio: breakdown.total !== 0 ? cny / breakdown.total : 0,
    }));

  return (
    <Card className="card-flat">
      <CardHeader>
        <CardTitle>按币种聚合</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <THead>
            <TR>
              <TH>币种</TH>
              <TH className="text-right">原币</TH>
              <TH className="text-right">CNY</TH>
              <TH className="text-right">占比</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.currency}>
                <TD className="font-mono text-xs uppercase">{r.currency}</TD>
                <TD className="num text-right">
                  {formatCurrency(r.native, r.currency)}
                </TD>
                <TD className="num text-right">{formatCurrency(r.cny)}</TD>
                <TD className="num text-right text-muted-foreground">
                  {formatPercent(r.ratio)}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}
