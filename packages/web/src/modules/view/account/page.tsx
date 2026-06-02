/**
 * [INPUT]: ./data (useAccounts), sections/account-table, shared/layout/page-shell
 * [OUTPUT]: <AccountListPage /> — /accounts 路由
 * [POS]: modules/view/account/page.tsx
 * [RUNTIME]: client
 * [PROTOCOL]: 加筛选/搜索时在此组装，不在 section 内部做
 */
import { Card, CardContent } from "@/shared/ui/card";
import { PageEmpty, PageError, PageShell } from "@/shared/layout/page-shell";
import { useAccounts } from "./data";
import { AccountTable } from "./sections/account-table";

export function AccountListPage() {
  const { data, error, loading } = useAccounts();

  return (
    <PageShell
      eyebrow="01 · ACCOUNTS"
      title="账户"
      subtitle="所有活跃账户的余额一览。点击进入持仓与交易明细。"
    >
      {loading && <div className="h-64 animate-pulse rounded-md bg-card" />}
      {error && <PageError message={`接口出错：${error.message}`} />}
      {data && data.accounts.length === 0 && (
        <PageEmpty message="还没有账户。先用 CLI 录入：finsight account add" />
      )}
      {data && data.accounts.length > 0 && (
        <Card className="card-flat">
          <CardContent className="p-0">
            <AccountTable accounts={data.accounts} />
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
