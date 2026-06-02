/**
 * [INPUT]: recharts, shared/ui/card, shared/lib/format
 * [OUTPUT]: <HistoryTrend history currency /> — 单账户余额时序（历史 + 当前点闭合）
 * [POS]: account/sections
 * [RUNTIME]: client
 * [PROTOCOL]: history 来自 GET /api/accounts/:id，包含 yzyx-historical + global baseline
 */
import {
  Area,
  AreaChart,
  CartesianGrid,
  Dot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { formatCurrency } from "@/shared/lib/format";
import type { HistoryPoint } from "../data";

interface CurrentDotProps {
  cx?: number;
  cy?: number;
  payload?: { source?: "historical" | "current" };
}

function CurrentDot({ cx, cy, payload }: CurrentDotProps) {
  if (cx == null || cy == null) return null;
  if (payload?.source === "current") {
    return (
      <g>
        <circle
          cx={cx}
          cy={cy}
          r={6}
          fill="var(--accent)"
          stroke="var(--surface)"
          strokeWidth={2}
        />
      </g>
    );
  }
  return <Dot cx={cx} cy={cy} r={3} fill="var(--meta)" />;
}

export function HistoryTrend({
  history,
  currency,
}: {
  history: HistoryPoint[];
  currency: string;
}) {
  if (history.length === 0) return null;
  const data = history.map((h) => ({
    date: h.snapshot_date,
    total: h.total_net_worth,
    source: h.source,
  }));
  const hasCurrent = history.some((h) => h.source === "current");
  const sub = hasCurrent
    ? `${history.length} 个时间点 · 红色圆点为当前快照`
    : `${history.length} 个历史时间点（来自有知有行）`;

  return (
    <Card className="card-flat">
      <CardHeader>
        <CardTitle>余额时序</CardTitle>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardHeader>
      <CardContent className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="acctHist" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--meta)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--meta)" stopOpacity={0} />
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
              tickFormatter={(v: number) =>
                formatCurrency(v, currency).replace(/[¥$]/, "")
              }
            />
            <Tooltip
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={((v: unknown, _name: unknown, item: unknown) => {
                const payload = (item as { payload?: { source?: string } })?.payload;
                const tag = payload?.source === "current" ? "当前" : "历史";
                return [formatCurrency(Number(v), currency), tag];
              }) as never}
            />
            <Area
              type="monotone"
              dataKey="total"
              stroke="var(--meta)"
              strokeWidth={2}
              fill="url(#acctHist)"
              dot={<CurrentDot />}
              activeDot={{ r: 6, fill: "var(--accent)" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
