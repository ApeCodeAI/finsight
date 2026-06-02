import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { ledgerPaths } from "./paths.js";
import { ensureLedgerSkeleton } from "./read.js";
import {
  LEDGER_SCHEMA_VERSION,
  type LedgerAccountsFile,
  type LedgerFxRate,
  type LedgerReconciliation,
  type LedgerSnapshotFile,
  type LedgerTransaction,
} from "./types.js";

const README_TEMPLATE = `# finsight ledger

这是 finsight 的真相源（file-first）。SQLite 数据库 (~/.finsight/data/finsight.db) 只是从这里重建出来的派生缓存。

## 文件格式约定

- **YAML** = stateful document / lookup dict（当前状态、人/AI 都能改）
- **JSONL** = append-only 时间序列（一行一个不可变事件；AI \`jq\` / grep 友好）
- **Markdown** = prose body + YAML frontmatter

## 文件说明

- \`accounts.yaml\` — 账户元信息 + 嵌套持仓（YAML — 当前状态）
- \`transactions.jsonl\` — 交易事件流，一行一笔
- \`snapshots.jsonl\` — 每日净资产快照，一行一日（含 per-account/position 明细）
- \`fx-rates.jsonl\` — 汇率历史，一行一个 (date, from, to, rate)
- \`reconciliations.jsonl\` — broker-vs-computed 对账记录
- \`decisions/YYYY-MM/<ulid>.md\` — 决策日志，markdown body + YAML frontmatter

## 工作流

- \`finsight ledger init\` — 一次性配置 ledger 目录到 ~/.finsight/config.json
- \`finsight ledger export\` — 把当前 DB 一次性 dump 到 ledger（迁移用）
- \`finsight ledger rebuild\` — 强制从 ledger 重建 DB cache
- \`finsight ledger verify\` — 检查 ledger 和 DB cache 是否一致

每次 finsight 启动时会自动读 ledger 并重建 DB cache。所以你可以放心手编辑 \`accounts.yaml\` —— 下次任何 finsight 命令都会用最新内容。
`;

export function writeAccountsFile(
  root: string,
  data: LedgerAccountsFile,
): void {
  ensureLedgerSkeleton(root);
  const p = ledgerPaths(root);
  const ordered = {
    schema_version: data.schema_version ?? LEDGER_SCHEMA_VERSION,
    accounts: data.accounts.map(orderAccount),
  };
  writeFileSync(p.accounts, YAML.stringify(ordered, { lineWidth: 0 }));
}

export function appendTransaction(
  root: string,
  txn: LedgerTransaction,
): void {
  ensureLedgerSkeleton(root);
  const p = ledgerPaths(root);
  appendFileSync(p.transactions, `${JSON.stringify(txn)}\n`);
}

/** Generic JSONL writer — overwrites the file with one JSON object per line. */
function writeJsonl(file: string, rows: unknown[]): void {
  if (rows.length === 0) {
    writeFileSync(file, "");
    return;
  }
  writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
}

export function writeAllTransactions(
  root: string,
  txns: LedgerTransaction[],
): void {
  ensureLedgerSkeleton(root);
  writeJsonl(ledgerPaths(root).transactions, txns);
}

export function writeAllSnapshots(
  root: string,
  snaps: LedgerSnapshotFile[],
): void {
  ensureLedgerSkeleton(root);
  writeJsonl(ledgerPaths(root).snapshots, snaps);
}

export function writeAllFxRates(root: string, rows: LedgerFxRate[]): void {
  ensureLedgerSkeleton(root);
  writeJsonl(ledgerPaths(root).fxRates, rows);
}

export function writeAllReconciliations(
  root: string,
  rows: LedgerReconciliation[],
): void {
  ensureLedgerSkeleton(root);
  writeJsonl(ledgerPaths(root).reconciliations, rows);
}

/**
 * Remove vault artifacts from previous layouts / dropped features:
 *  - `snapshots/` folder (pre-JSONL layout)
 *  - `fx-rates.yaml`     (pre-JSONL layout, replaced by fx-rates.jsonl)
 *  - `incomes.jsonl`     (removed feature: budgeting was out of scope)
 *  - `expenses.jsonl`    (removed feature: budgeting was out of scope)
 *
 * Idempotent — silent no-op for each path that doesn't exist.
 */
export function cleanupLegacyArtifacts(root: string): void {
  const p = ledgerPaths(root);
  if (existsSync(p.snapshotsLegacyDir)) {
    try {
      const st = statSync(p.snapshotsLegacyDir);
      if (st.isDirectory()) {
        // Only remove if it ONLY contains .json files (defensive — user might
        // have parked something else there).
        const entries = readdirSync(p.snapshotsLegacyDir);
        const onlyJson = entries.every((e) => e.endsWith(".json"));
        if (onlyJson) {
          rmSync(p.snapshotsLegacyDir, { recursive: true, force: true });
        }
      }
    } catch {
      // best effort
    }
  }
  const removedFiles = [
    p.fxRatesLegacyYaml,
    path.join(root, "incomes.jsonl"),
    path.join(root, "expenses.jsonl"),
  ];
  for (const file of removedFiles) {
    if (existsSync(file)) {
      try {
        rmSync(file, { force: true });
      } catch {
        // best effort
      }
    }
  }
}

export function ensureReadme(root: string): void {
  const p = ledgerPaths(root);
  if (!existsSync(p.readme)) {
    mkdirSync(p.root, { recursive: true });
    writeFileSync(p.readme, README_TEMPLATE);
  }
}

/** Order keys so YAML output is stable and human-readable. */
function orderAccount(
  a: LedgerAccountsFile["accounts"][number],
): LedgerAccountsFile["accounts"][number] {
  const out: Record<string, unknown> = {
    id: a.id,
    name: a.name,
    type: a.type,
    institution: a.institution,
    currency: a.currency,
    cash_balance: round(a.cash_balance, 2),
    tags: a.tags ?? [],
    is_active: a.is_active !== false,
    notes: a.notes,
  };
  if (a.positions && a.positions.length > 0) {
    out.positions = a.positions.map((p) => ({
      symbol: p.symbol,
      name: p.name,
      currency: p.currency,
      quantity: p.quantity,
      avg_cost: p.avg_cost,
      current_price: p.current_price,
      tags: p.tags ?? [],
      notes: p.notes,
      opened_at: p.opened_at,
      closed_at: p.closed_at,
    }));
  } else {
    out.positions = [];
  }
  return out as unknown as LedgerAccountsFile["accounts"][number];
}

function round(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}
