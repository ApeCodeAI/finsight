/**
 * [INPUT]: shared/ui/card, useDecisionAlerts, react-router-dom Link
 * [OUTPUT]: <DecisionAlertsCard /> — Overview / Decisions 顶部"⚠ N triggered / pending rationale"
 * [POS]: view/decision/sections
 * [RUNTIME]: client
 * [PROTOCOL]: 只显示有内容时；空状态返回 null
 */
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/shared/ui/card";
import { useDecisionAlerts } from "../data";

export function DecisionAlertsCard() {
  const { data } = useDecisionAlerts();
  if (!data) return null;
  const triggered = data.triggered;
  const pending = data.pending_rationale;
  if (triggered.length === 0 && pending.length === 0) return null;

  return (
    <Card className="card-flat border-l-4 border-l-[var(--warn)]">
      <CardContent className="flex flex-col gap-3 p-5">
        {triggered.length > 0 && (
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-warn">
              ⚠ 目标价 / 止损触发
            </p>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {triggered.map((a) => (
                <li key={a.decision_id + a.kind}>
                  <Link
                    to={`/decisions/${a.decision_id}`}
                    className="text-foreground hover:text-meta hover:underline"
                  >
                    <span className="font-mono">{a.symbol}</span>{" "}
                    {a.kind === "stop_loss" ? (
                      <span className="text-danger">触发止损</span>
                    ) : (
                      <span className="text-success">达到目标</span>
                    )}{" "}
                    <span className="num text-muted">
                      {a.current_price} vs {a.threshold}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        {pending.length > 0 && (
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-meta">
              📝 待补 rationale
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {pending.length} 笔 buy/sell 还没写理由 ·{" "}
              <code className="font-mono text-xs">
                finsight decision review
              </code>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
