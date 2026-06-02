/**
 * [INPUT]: ./data, sections/symbol-table, shared/layout/page-shell
 * [OUTPUT]: <SymbolListPage /> — /symbols 路由
 * [POS]: modules/view/symbol/page.tsx
 * [RUNTIME]: client
 * [PROTOCOL]: 加筛选/分组时在此组合
 */
import { Card, CardContent } from "@/shared/ui/card";
import { PageEmpty, PageError, PageShell } from "@/shared/layout/page-shell";
import { useSymbols } from "./data";
import { SymbolTable } from "./sections/symbol-table";

export function SymbolListPage() {
  const { data, error, loading } = useSymbols();

  return (
    <PageShell
      eyebrow="02 · SYMBOLS"
      title="标的"
      subtitle="按标的聚合的持仓视图。同标的跨账户的份额合并，按 CNY 市值降序。"
    >
      {loading && <div className="h-64 animate-pulse rounded-md bg-card" />}
      {error && <PageError message={error.message} />}
      {data && data.symbols.length === 0 && (
        <PageEmpty message="没有持仓" />
      )}
      {data && data.symbols.length > 0 && (
        <Card className="card-flat">
          <CardContent className="p-0">
            <SymbolTable symbols={data.symbols} />
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
