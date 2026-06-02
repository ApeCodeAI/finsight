/**
 * [INPUT]: shared/ui/card, shared/ui/badge, shared/lib/format, data/account-type, react-router-dom Link
 * [OUTPUT]: <TopAccounts accounts />
 * [POS]: overview 账户快览（按 CNY 余额降序前 N）
 * [RUNTIME]: client
 * [PROTOCOL]: 不要在此 fetch，accounts 由 page.tsx 传入
 */
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { formatCurrency } from "@/shared/lib/format";
import { accountTypeLabel, accountTypeVariant } from "@/data/account-type";
import type { OverviewAccount } from "../data";

export function TopAccounts({ accounts }: { accounts: OverviewAccount[] }) {
  const top = [...accounts]
    .sort((a, b) => b.balance_base - a.balance_base)
    .slice(0, 8);

  return (
    <Card className="card-flat">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>主要账户</CardTitle>
        <Link to="/accounts" className="text-xs text-meta hover:underline">
          查看全部 →
        </Link>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {top.map((acc) => (
          <Link
            key={acc.id}
            to={`/accounts/${acc.id}`}
            className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3 transition-colors hover:bg-secondary"
          >
            <div className="flex flex-col">
              <span className="text-sm font-medium">{acc.name}</span>
              <span className="mt-1 text-xs text-muted-foreground">
                {acc.currency}
              </span>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="num text-sm font-semibold">
                {formatCurrency(acc.balance_base)}
              </span>
              <Badge variant={accountTypeVariant(acc.type)}>
                {accountTypeLabel(acc.type)}
              </Badge>
            </div>
          </Link>
        ))}
        {top.length === 0 && (
          <p className="col-span-full p-6 text-center text-sm text-muted-foreground">
            还没有账户。试试 finsight account add 或 finsight import-md。
          </p>
        )}
      </CardContent>
    </Card>
  );
}
