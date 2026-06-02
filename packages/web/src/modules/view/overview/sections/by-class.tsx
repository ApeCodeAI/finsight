/**
 * [INPUT]: shared/ui/{card}, shared/lib/format, shared/hooks/use-api, data/asset-class, react-router-dom Link
 * [OUTPUT]: <ByAssetClass /> — 顶级类别配置 + 盈亏 + 占比，看清"钱在哪"
 * [POS]: overview/sections
 * [RUNTIME]: client
 * [PROTOCOL]: 数据来自 /api/analytics/by-class，server 计算
 */
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { useApi } from "@/shared/hooks/use-api";
import {
  formatCurrency,
  formatPercent,
  pnlClass,
  signedCurrency,
} from "@/shared/lib/format";
import { ASSET_CLASS_COLOR } from "@/data/asset-class";
import type { AssetClass } from "@/modules/view/position/data";

interface Bucket {
  asset_class: AssetClass;
  label: string;
  value_base: number;
  cost_base: number;
  pnl_base: number;
  pnl_pct: number;
  weight: number;
  position_count: number;
  symbol_count: number;
  accounts: string[];
}

interface ByClassPayload {
  total_base: number;
  buckets: Bucket[];
}

export function ByAssetClass() {
  const { data, loading, error } = useApi<ByClassPayload>(
    "/api/analytics/by-class",
  );

  return (
    <Card className="card-flat">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>钱在哪 · 资产类别全貌</CardTitle>
        <Link to="/positions" className="text-xs text-meta hover:underline">
          查看持仓详情 →
        </Link>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-5 pt-0">
        {loading && <div className="h-32 animate-pulse rounded-md bg-secondary" />}
        {error && <p className="text-sm text-danger">{error.message}</p>}
        {data && (
          <>
            <StackedBar buckets={data.buckets} />
            <div className="grid grid-cols-1 gap-2">
              {data.buckets.map((b) => (
                <div
                  key={b.asset_class}
                  className="flex items-center gap-4 rounded-md border border-border bg-card px-4 py-3"
                >
                  <span
                    className="size-3 shrink-0 rounded-sm"
                    style={{ background: ASSET_CLASS_COLOR[b.asset_class] }}
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-medium">{b.label}</span>
                    <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
                      {b.position_count > 0
                        ? `${b.position_count} 持仓 · ${b.symbol_count} 标的`
                        : "现金 / 余额"}
                    </span>
                  </div>
                  <div className="num shrink-0 text-right text-sm font-medium">
                    {formatCurrency(b.value_base)}
                  </div>
                  <div className="shrink-0 text-right">
                    {b.cost_base > 0 ? (
                      <span
                        className={`num text-sm font-medium ${pnlClass(b.pnl_base)}`}
                      >
                        {signedCurrency(b.pnl_base)}
                      </span>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                    {b.cost_base > 0 && (
                      <div className={`text-xs ${pnlClass(b.pnl_base)}`}>
                        {formatPercent(b.pnl_pct)}
                      </div>
                    )}
                  </div>
                  <div className="num shrink-0 w-16 text-right text-sm text-muted-foreground">
                    {formatPercent(b.weight)}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StackedBar({ buckets }: { buckets: Bucket[] }) {
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--surface-warm)]">
      {buckets.map((b) => (
        <div
          key={b.asset_class}
          style={{
            width: `${b.weight * 100}%`,
            background: ASSET_CLASS_COLOR[b.asset_class],
          }}
          title={`${b.label} · ${formatPercent(b.weight)}`}
        />
      ))}
    </div>
  );
}
