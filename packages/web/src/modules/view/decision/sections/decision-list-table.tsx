/**
 * [INPUT]: shared/ui/{table,badge}, react-router-dom Link
 * [OUTPUT]: <DecisionListTable decisions onClick? /> — 决策列表
 * [POS]: view/decision/sections
 * [RUNTIME]: client
 * [PROTOCOL]: 列定义改动同步 page.tsx
 */
import { Link } from "react-router-dom";
import { Table, TBody, THead, TH, TR, TD } from "@/shared/ui/table";
import { Badge } from "@/shared/ui/badge";
import type { Decision, DecisionType } from "../data";

const TYPE_VARIANT: Record<DecisionType, "primary" | "success" | "warn" | "danger" | "muted" | "default"> = {
  rationale: "primary",
  target: "success",
  "stop-loss": "danger",
  rethink: "warn",
  retro: "muted",
  note: "default",
};

const TYPE_LABEL: Record<DecisionType, string> = {
  rationale: "理由",
  target: "目标",
  "stop-loss": "止损",
  rethink: "重审",
  retro: "复盘",
  note: "随笔",
};

interface Props {
  decisions: Decision[];
  showSubject?: boolean; // include symbols column
}

export function DecisionListTable({ decisions, showSubject = true }: Props) {
  if (decisions.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        还没有决策记录。
        <br />
        <span className="font-mono text-xs">
          finsight decision add --type note --body "..."
        </span>
      </div>
    );
  }
  return (
    <Table>
      <THead>
        <TR>
          <TH>日期</TH>
          <TH>类型</TH>
          {showSubject && <TH>标的</TH>}
          <TH>信心</TH>
          <TH className="text-right">目标</TH>
          <TH className="text-right">止损</TH>
          <TH>标题</TH>
        </TR>
      </THead>
      <TBody>
        {decisions.map((d) => (
          <TR key={d.id}>
            <TD className="font-mono text-xs">{d.date}</TD>
            <TD>
              <Badge variant={TYPE_VARIANT[d.type]}>{TYPE_LABEL[d.type]}</Badge>
            </TD>
            {showSubject && (
              <TD>
                {d.symbols.length > 0 ? (
                  <span className="flex flex-wrap gap-1">
                    {d.symbols.map((s) => (
                      <Link
                        key={s}
                        to={`/symbols/${encodeURIComponent(s)}`}
                        className="font-mono text-xs text-meta hover:underline"
                      >
                        {s}
                      </Link>
                    ))}
                  </span>
                ) : (
                  <span className="text-xs text-muted">—</span>
                )}
              </TD>
            )}
            <TD>
              {d.conviction ? (
                <span
                  className={
                    d.conviction === "high"
                      ? "text-success"
                      : d.conviction === "low"
                        ? "text-danger"
                        : "text-warn"
                  }
                >
                  {d.conviction}
                </span>
              ) : (
                "—"
              )}
            </TD>
            <TD className="num text-right">{d.exit_target ?? "—"}</TD>
            <TD className="num text-right">{d.stop_loss ?? "—"}</TD>
            <TD>
              <Link
                to={`/decisions/${d.id}`}
                className="text-foreground hover:text-meta hover:underline"
              >
                {d.title.slice(0, 60)}
              </Link>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

export { TYPE_LABEL as DECISION_TYPE_LABEL, TYPE_VARIANT as DECISION_TYPE_VARIANT };
