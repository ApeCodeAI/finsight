/**
 * [INPUT]: shared/ui/{card,badge}, shared/lib/format
 * [OUTPUT]: <SymbolHeader symbol /> — 标的详情顶部 hero
 * [POS]: symbol/sections
 * [RUNTIME]: client
 * [PROTOCOL]: 仅 CNY 字段必填，native 字段在跨币种时为 null
 */
import { Card, CardContent } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  pnlClass,
  signedCurrency,
} from "@/shared/lib/format";
import type { SymbolDetail } from "../data";

export function SymbolHeader({ detail }: { detail: SymbolDetail }) {
  return (
    <Card className="card-raised">
      <CardContent className="flex flex-col gap-6 p-6 md:flex-row md:items-end md:justify-between md:p-8">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {detail.currencies.map((c) => (
              <Badge
                key={c}
                variant={c === "CNY" ? "muted" : c === "USD" ? "primary" : "warn"}
              >
                {c}
              </Badge>
            ))}
            <span className="font-mono text-[11px] uppercase tracking-widest text-muted">
              · {detail.account_count} 个账户持有
            </span>
          </div>
          <h2 className="font-display text-2xl font-semibold md:text-3xl">
            {detail.symbol}
          </h2>
          {detail.name && detail.name !== detail.symbol && (
            <p className="text-sm text-muted-foreground">{detail.name}</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4 md:gap-8">
          <Stat
            label="总数量"
            value={formatNumber(detail.total_quantity)}
          />
          <Stat
            label="加权成本"
            value={`${formatNumber(detail.avg_cost)} ${detail.primary_currency}`}
          />
          <Stat
            label="CNY 市值"
            value={formatCurrency(detail.market_value_base)}
            highlight
          />
          <Stat
            label="占总仓位"
            value={formatPercent(detail.portfolio_weight)}
          />
        </div>
      </CardContent>
      <CardContent className="border-t border-border pt-4">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
          <span className="text-muted-foreground">盈亏：</span>
          <span className={`num font-semibold ${pnlClass(detail.pnl_base)}`}>
            {signedCurrency(detail.pnl_base)} CNY
          </span>
          <span className={`num font-semibold ${pnlClass(detail.pnl_base)}`}>
            {formatPercent(detail.pnl_pct_base)}
          </span>
          {detail.pnl_native != null && detail.currencies.length === 1 && (
            <span className={`num text-muted-foreground`}>
              · 原币种盈亏{" "}
              <span className={pnlClass(detail.pnl_native)}>
                {signedCurrency(detail.pnl_native, detail.currencies[0])}
              </span>
            </span>
          )}
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
