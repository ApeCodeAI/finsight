/**
 * [INPUT]: shared/ui/{card,badge}, shared/lib/format, data/account-type
 * [OUTPUT]: <AccountHeader account summary />
 * [POS]: account 详情页头部
 * [RUNTIME]: client
 * [PROTOCOL]: summary 由 server /api/accounts/:id 计算（CNY 折算）
 */
import { Card, CardContent } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { formatCurrency } from "@/shared/lib/format";
import { accountTypeLabel, accountTypeVariant } from "@/data/account-type";
import type { AccountRow, AccountSummary } from "../data";

interface Props {
  account: AccountRow;
  summary: AccountSummary;
}

export function AccountHeader({ account, summary }: Props) {
  return (
    <Card className="card-raised">
      <CardContent className="flex flex-col gap-6 p-6 md:flex-row md:items-end md:justify-between md:p-8">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <Badge variant={accountTypeVariant(account.type)}>
              {accountTypeLabel(account.type)}
            </Badge>
            {account.institution && (
              <span className="font-mono text-[11px] uppercase tracking-widest text-muted">
                {account.institution}
              </span>
            )}
            <span className="font-mono text-[11px] uppercase tracking-widest text-muted">
              · {account.currency}
            </span>
          </div>
          <h2 className="font-display text-2xl font-semibold md:text-3xl">
            {account.name}
          </h2>
          {account.notes && (
            <p className="max-w-xl text-sm text-muted-foreground">{account.notes}</p>
          )}
        </div>
        <div className="grid grid-cols-3 gap-6 md:gap-10">
          <Stat
            label="账户总额"
            value={formatCurrency(summary.account_total_base)}
            highlight
          />
          <Stat label="现金余额" value={formatCurrency(summary.cash_base)} />
          <Stat label="持仓市值" value={formatCurrency(summary.positions_total_base)} />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[11px] uppercase tracking-widest text-muted">
        {label}
      </span>
      <span
        className={`num ${highlight ? "text-xl font-semibold md:text-2xl" : "text-base"}`}
      >
        {value}
      </span>
    </div>
  );
}
