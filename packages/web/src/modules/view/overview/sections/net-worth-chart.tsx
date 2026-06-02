/**
 * [INPUT]: recharts, shared/ui/card, shared/lib/format
 * [OUTPUT]: <NetWorthChart snapshots />
 * [POS]: overview 净值趋势图
 * [RUNTIME]: client
 * [PROTOCOL]: 改图表类型 / 配色时对照 DESIGN.md
 */
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { formatCurrency } from "@/shared/lib/format";
import type { OverviewSnapshot } from "../data";

export function NetWorthChart({ snapshots }: { snapshots: OverviewSnapshot[] }) {
  const data = [...snapshots]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => ({ date: s.date, total: s.total }));

  return (
    <Card className="card-flat">
      <CardHeader>
        <CardTitle>净值趋势</CardTitle>
      </CardHeader>
      <CardContent className="h-72">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            还没有快照。试试 finsight snapshot take。
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="nwArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
              <XAxis
                dataKey="date"
                stroke="var(--muted)"
                tick={{ fontSize: 11, fill: "var(--muted)" }}
              />
              <YAxis
                stroke="var(--muted)"
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                tickFormatter={(v: number) => formatCurrency(v).replace("¥", "¥ ")}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={((v: unknown) => [formatCurrency(Number(v)), "净值"]) as never}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke="var(--accent)"
                strokeWidth={2}
                fill="url(#nwArea)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
