/**
 * [INPUT]: recharts, shared/ui/card, data/account-type
 * [OUTPUT]: <AllocationPie allocation />
 * [POS]: overview 资产配置饼图
 * [RUNTIME]: client
 * [PROTOCOL]: 颜色都从 tokens 取，新增类型同步 data/account-type
 */
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { accountTypeLabel } from "@/data/account-type";
import { formatPercent } from "@/shared/lib/format";

const SLICE_COLORS = [
  "var(--accent)",
  "var(--success)",
  "var(--warn)",
  "var(--meta)",
  "color-mix(in oklab, var(--accent), white 35%)",
  "color-mix(in oklab, var(--success), white 35%)",
  "color-mix(in oklab, var(--warn), white 35%)",
];

export function AllocationPie({ allocation }: { allocation: Record<string, number> }) {
  const entries = Object.entries(allocation)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([type, ratio]) => ({
      type,
      label: accountTypeLabel(type),
      ratio,
    }));

  return (
    <Card className="card-flat">
      <CardHeader>
        <CardTitle>资产配置</CardTitle>
      </CardHeader>
      <CardContent className="h-72">
        {entries.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            没有可分配的余额
          </div>
        ) : (
          <div className="flex h-full items-center gap-4">
            <ResponsiveContainer width="55%" height="100%">
              <PieChart>
                <Pie
                  data={entries}
                  dataKey="ratio"
                  nameKey="label"
                  innerRadius={45}
                  outerRadius={90}
                  stroke="var(--surface)"
                  strokeWidth={2}
                >
                  {entries.map((_, i) => (
                    <Cell key={i} fill={SLICE_COLORS[i % SLICE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={((v: unknown) => [formatPercent(Number(v)), "占比"]) as never}
                />
              </PieChart>
            </ResponsiveContainer>
            <ul className="flex flex-1 flex-col gap-2 text-sm">
              {entries.map((e, i) => (
                <li key={e.type} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-sm"
                      style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }}
                    />
                    {e.label}
                  </span>
                  <span className="num text-muted">{formatPercent(e.ratio)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
