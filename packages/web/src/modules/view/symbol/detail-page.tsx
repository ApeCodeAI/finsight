/**
 * [INPUT]: react-router-dom useParams + Link, ./data, sections/*, shared/layout/page-shell
 * [OUTPUT]: <SymbolDetailPage /> — /symbols/:symbol 路由
 * [POS]: modules/view/symbol/detail-page.tsx
 * [RUNTIME]: client
 * [PROTOCOL]: symbol 路径段需 URI-decode（中文标的）
 */
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PageEmpty, PageError, PageShell } from "@/shared/layout/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { useSymbol } from "./data";
import { SymbolHeader } from "./sections/symbol-header";
import { LegTable } from "./sections/leg-table";
import { SymbolTransactions } from "./sections/symbol-transactions";
import { DecisionListTable } from "../decision/sections/decision-list-table";

export function SymbolDetailPage() {
  const { symbol } = useParams<{ symbol: string }>();
  const decoded = symbol ? decodeURIComponent(symbol) : undefined;
  const { data, error, loading } = useSymbol(decoded);

  if (loading) {
    return (
      <PageShell eyebrow="02 · SYMBOL" title="加载中">
        <div className="h-64 animate-pulse rounded-md bg-card" />
      </PageShell>
    );
  }
  if (error) {
    return (
      <PageShell eyebrow="02 · SYMBOL" title="出错">
        <PageError message={error.message} />
      </PageShell>
    );
  }
  if (!data || !("symbol" in data)) {
    return (
      <PageShell eyebrow="02 · SYMBOL" title="标的不存在">
        <PageEmpty message="返回 /symbols 重新选择" />
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow={`02 · SYMBOL · ${data.symbol}`}
      title={
        <span className="flex items-center gap-3">
          <Link to="/symbols" className="text-muted-foreground hover:text-meta">
            <ArrowLeft className="size-5" />
          </Link>
          {data.symbol}
        </span>
      }
    >
      <SymbolHeader detail={data} />

      <Card className="card-flat">
        <CardHeader>
          <CardTitle>
            分账户细分 · {data.legs.length} 个持仓
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <LegTable legs={data.legs} />
        </CardContent>
      </Card>

      <Card className="card-flat">
        <CardHeader>
          <CardTitle>
            交易历史 · {data.transactions.length} 条
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <SymbolTransactions transactions={data.transactions} />
        </CardContent>
      </Card>

      {data.decisions && data.decisions.length > 0 && (
        <Card className="card-flat">
          <CardHeader>
            <CardTitle>决策时间线 · {data.decisions.length} 条</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DecisionListTable decisions={data.decisions} showSubject={false} />
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
