/**
 * [INPUT]: recharts, shared/ui/card, shared/lib/format
 * [OUTPUT]: <SnapshotTrend snapshots /> — 净值时间序列
 * [POS]: view/snapshot/sections
 * [RUNTIME]: client
 * [PROTOCOL]: 配色与 overview 保持一致
 */
import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { formatCurrency } from "@/shared/lib/format";
import type { SnapshotRow } from "../data";

export function SnapshotTrend({ snapshots }: { snapshots: SnapshotRow[] }) {
  const data = [...snapshots]
    .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))
    .map((s) => ({ date: s.snapshot_date, total: s.total_net_worth }));

  return (
    <Card className="card-flat">
      <CardHeader>
        <CardTitle>历史净值</CardTitle>
      </CardHeader>
      <CardContent className="h-72">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            还没有快照
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
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
              <Line
                type="monotone"
                dataKey="total"
                stroke="var(--accent)"
                strokeWidth={2}
                dot={{ r: 3, fill: "var(--accent)" }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
