/**
 * [INPUT]: shared/ui/{table,badge}, shared/lib/format, data/account-type, react-router-dom Link
 * [OUTPUT]: <AccountTable accounts /> — 账户列表表格
 * [POS]: view/account/sections
 * [RUNTIME]: client
 * [PROTOCOL]: 列变化时同步 page.tsx 顶层
 */
import { Link } from "react-router-dom";
import { Table, TBody, THead, TH, TR, TD, TFoot } from "@/shared/ui/table";
import { Badge } from "@/shared/ui/badge";
import { formatCurrency } from "@/shared/lib/format";
import { accountTypeLabel, accountTypeVariant } from "@/data/account-type";
import type { AccountRow } from "../data";

export function AccountTable({ accounts }: { accounts: AccountRow[] }) {
  const total = accounts.reduce((s, a) => s + a.total_value_base, 0);

  return (
    <Table>
      <THead>
        <TR>
          <TH>名称</TH>
          <TH>类型</TH>
          <TH>币种</TH>
          <TH className="text-right">原币市值</TH>
          <TH className="text-right">CNY 估值</TH>
        </TR>
      </THead>
      <TBody>
        {accounts.map((acc) => (
          <TR key={acc.id}>
            <TD>
              <Link
                to={`/accounts/${acc.id}`}
                className="font-medium text-foreground hover:text-meta hover:underline"
              >
                {acc.name}
              </Link>
              {acc.institution && (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {acc.institution}
                </div>
              )}
            </TD>
            <TD>
              <Badge variant={accountTypeVariant(acc.type)}>
                {accountTypeLabel(acc.type)}
              </Badge>
            </TD>
            <TD className="font-mono text-xs uppercase">{acc.currency}</TD>
            <TD className="num text-right">
              {formatCurrency(acc.total_value, acc.currency)}
            </TD>
            <TD className="num text-right font-medium">
              {formatCurrency(acc.total_value_base)}
            </TD>
          </TR>
        ))}
      </TBody>
      {accounts.length > 0 && (
        <TFoot>
          <TR>
            <TD colSpan={4} className="text-right text-xs uppercase tracking-wider text-muted">
              合计 (CNY)
            </TD>
            <TD className="num text-right font-semibold">{formatCurrency(total)}</TD>
          </TR>
        </TFoot>
      )}
    </Table>
  );
}
