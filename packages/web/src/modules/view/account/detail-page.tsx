/**
 * [INPUT]: react-router-dom useParams + Link, ./data, sections/*, shared/layout/page-shell
 * [OUTPUT]: <AccountDetailPage /> — /accounts/:id 路由
 * [POS]: modules/view/account/detail-page.tsx
 * [RUNTIME]: client
 * [PROTOCOL]: 加 tabs / 子节时在此组装
 */
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PageEmpty, PageError, PageShell } from "@/shared/layout/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { useAccount } from "./data";
import { AccountHeader } from "./sections/account-header";
import { PositionTable } from "./sections/position-table";
import { TransactionList } from "./sections/transaction-list";
import { HistoryTrend } from "./sections/history-trend";
import { DecisionListTable } from "../decision/sections/decision-list-table";

export function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading } = useAccount(id);

  if (loading) {
    return (
      <PageShell eyebrow="01 · ACCOUNT" title="加载中">
        <div className="h-64 animate-pulse rounded-md bg-card" />
      </PageShell>
    );
  }
  if (error) {
    return (
      <PageShell eyebrow="01 · ACCOUNT" title="出错">
        <PageError message={error.message} />
      </PageShell>
    );
  }
  if (!data || !("account" in data)) {
    return (
      <PageShell eyebrow="01 · ACCOUNT" title="账户不存在">
        <PageEmpty message="返回 /accounts 重新选择" />
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow={`01 · ACCOUNT · ${data.account.id.slice(0, 8)}`}
      title={
        <span className="flex items-center gap-3">
          <Link
            to="/accounts"
            className="text-muted-foreground hover:text-meta"
          >
            <ArrowLeft className="size-5" />
          </Link>
          {data.account.name}
        </span>
      }
    >
      <AccountHeader account={data.account} summary={data.summary} />

      <HistoryTrend history={data.history} currency={data.account.currency} />

      <Card className="card-flat">
        <CardHeader>
          <CardTitle>持仓明细</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <PositionTable positions={data.positions} />
        </CardContent>
      </Card>

      <Card className="card-flat">
        <CardHeader>
          <CardTitle>近期交易</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <TransactionList transactions={data.transactions} />
        </CardContent>
      </Card>

      {data.decisions.length > 0 && (
        <Card className="card-flat">
          <CardHeader>
            <CardTitle>相关决策</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DecisionListTable decisions={data.decisions} />
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
