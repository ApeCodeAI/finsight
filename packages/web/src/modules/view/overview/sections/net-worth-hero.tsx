/**
 * [INPUT]: shared/lib/format, shared/ui/card
 * [OUTPUT]: <NetWorthHero total accountCount asOf />
 * [POS]: overview 顶部 hero，单数据点放大
 * [RUNTIME]: client
 * [PROTOCOL]: 变更字段命名时同步 page.tsx
 */
import { Card, CardContent } from "@/shared/ui/card";
import { formatCurrency } from "@/shared/lib/format";

interface Props {
  total: number;
  accountCount: number;
  asOf: string;
}

export function NetWorthHero({ total, accountCount, asOf }: Props) {
  return (
    <Card className="card-raised">
      <CardContent className="flex flex-col gap-3 p-6 md:p-8">
        <span className="block font-mono text-[11px] uppercase tracking-widest text-meta">
          Net Worth · CNY · {asOf}
        </span>
        <div className="num text-4xl font-semibold tracking-tight md:text-5xl">
          {formatCurrency(total)}
        </div>
        <div className="text-sm text-muted-foreground">
          共 {accountCount} 个账户
        </div>
      </CardContent>
    </Card>
  );
}
