/**
 * [INPUT]: ./data (useOverview), sections/*, shared/layout/page-shell
 * [OUTPUT]: <OverviewPage /> — 首页路由顶层
 * [POS]: modules/view/overview/page.tsx
 * [RUNTIME]: client
 * [PROTOCOL]: 新 section 在此组装，不在内层组件里做 fetch
 */
import { PageError, PageShell } from "@/shared/layout/page-shell";
import { useOverview } from "./data";
import { NetWorthHero } from "./sections/net-worth-hero";
import { NetWorthChart } from "./sections/net-worth-chart";
import { AllocationPie } from "./sections/allocation-pie";
import { TopAccounts } from "./sections/top-accounts";
import { ByAssetClass } from "./sections/by-class";
import { DecisionAlertsCard } from "../decision/sections/decision-alerts-card";
import { TargetGapCard } from "../target/sections/target-gap-card";
import { PerformanceCard } from "../performance/sections/performance-card";

export function OverviewPage() {
  const { data, error, loading } = useOverview();

  if (loading) {
    return (
      <PageShell eyebrow="00 · OVERVIEW" title="看清你的投资">
        <div className="h-64 animate-pulse rounded-md bg-card" />
      </PageShell>
    );
  }
  if (error) {
    return (
      <PageShell eyebrow="00 · OVERVIEW" title="看清你的投资">
        <PageError message={`接口出错：${error.message}`} />
      </PageShell>
    );
  }
  if (!data || data.by_account.length === 0) {
    return (
      <PageShell eyebrow="00 · OVERVIEW" title="欢迎使用 FinSight">
        <FirstRunGuide />
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow={`00 · OVERVIEW · ${data.snapshot_date}`}
      title="看清你的投资"
      subtitle="一眼看清现在有多少钱、配置如何、表现如何。"
    >
      <NetWorthHero
        total={data.total_net_worth}
        accountCount={data.by_account.length}
        asOf={data.snapshot_date}
      />
      <PerformanceCard />
      <DecisionAlertsCard />
      <TargetGapCard />
      <ByAssetClass />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <NetWorthChart snapshots={data.snapshots} />
        <AllocationPie allocation={data.allocation} />
      </div>
      <TopAccounts accounts={data.by_account} />
    </PageShell>
  );
}

/**
 * First-run friendly guide. Shown when there are no accounts yet — instead
 * of a blank page, give the user a concrete next-action ladder.
 */
function FirstRunGuide() {
  return (
    <div className="flex flex-col gap-6">
      <div className="card-raised flex flex-col gap-3 p-6 md:p-8">
        <p className="font-mono text-[11px] uppercase tracking-widest text-meta">
          ① 配置基础信息
        </p>
        <p className="text-sm text-muted-foreground">
          通过 CLI 设置 base currency 和语言：
        </p>
        <pre className="overflow-x-auto rounded-md bg-secondary p-3 font-mono text-xs">
          finsight init
          {"\n"}# 或非交互
          {"\n"}finsight config set base-currency CNY
          {"\n"}finsight config set labels-language zh
        </pre>
      </div>

      <div className="card-raised flex flex-col gap-3 p-6 md:p-8">
        <p className="font-mono text-[11px] uppercase tracking-widest text-meta">
          ② 录入账户和持仓
        </p>
        <p className="text-sm text-muted-foreground">
          可以用交互式命令，也可以让 AI 帮你录入（读 <code className="font-mono text-xs">skills/finsight/SKILL.md</code>）：
        </p>
        <pre className="overflow-x-auto rounded-md bg-secondary p-3 font-mono text-xs">
          finsight account add
          {"\n"}finsight trade buy 富途 AAPL 10 --price 180 --json
          {"\n"}finsight trade deposit 招商银行 30000 --note "salary"
        </pre>
      </div>

      <div className="card-raised flex flex-col gap-3 p-6 md:p-8">
        <p className="font-mono text-[11px] uppercase tracking-widest text-meta">
          ③ 同步到 vault + 检查健康
        </p>
        <pre className="overflow-x-auto rounded-md bg-secondary p-3 font-mono text-xs">
          finsight ledger sync
          {"\n"}finsight doctor
          {"\n"}finsight context  # AI 友好的完整 briefing
        </pre>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        想用 AI 全自动驱动？把{" "}
        <code className="font-mono">skills/finsight/SKILL.md</code> 喂给
        Claude / Cursor / Codex / GPT 自定义。
      </p>
    </div>
  );
}
