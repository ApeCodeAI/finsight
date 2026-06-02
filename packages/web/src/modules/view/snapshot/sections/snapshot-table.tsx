/**
 * [INPUT]: shared/ui/table, shared/lib/format
 * [OUTPUT]: <SnapshotTable snapshots /> — 历史快照列表
 * [POS]: view/snapshot/sections
 * [RUNTIME]: client
 * [PROTOCOL]: 列变化时同步 page.tsx
 */
import { Table, TBody, THead, TH, TR, TD } from "@/shared/ui/table";
import {
  formatCurrency,
  pnlClass,
  signedCurrency,
} from "@/shared/lib/format";
import type { SnapshotRow } from "../data";

export function SnapshotTable({ snapshots }: { snapshots: SnapshotRow[] }) {
  const sorted = [...snapshots].sort((a, b) =>
    b.snapshot_date.localeCompare(a.snapshot_date),
  );

  return (
    <Table>
      <THead>
        <TR>
          <TH>日期</TH>
          <TH className="text-right">净值 (CNY)</TH>
          <TH className="text-right">环比变化</TH>
          <TH>备注</TH>
        </TR>
      </THead>
      <TBody>
        {sorted.map((s, i) => {
          const next = sorted[i + 1];
          const delta = next ? s.total_net_worth - next.total_net_worth : null;
          return (
            <TR key={s.id}>
              <TD className="font-mono text-xs">{s.snapshot_date}</TD>
              <TD className="num text-right font-medium">
                {formatCurrency(s.total_net_worth)}
              </TD>
              <TD className={`num text-right ${delta != null ? pnlClass(delta) : ""}`}>
                {delta != null ? signedCurrency(delta) : "—"}
              </TD>
              <TD className="text-xs text-muted-foreground">{s.notes ?? ""}</TD>
            </TR>
          );
        })}
        {sorted.length === 0 && (
          <TR>
            <TD colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
              没有快照。试试 finsight snapshot take
            </TD>
          </TR>
        )}
      </TBody>
    </Table>
  );
}
