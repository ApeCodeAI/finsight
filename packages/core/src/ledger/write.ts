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

const README_TEMPLATE = `# FinSight legacy ledger export

SQLite (~/.finsight/data/finsight.db, unless configured otherwise) is FinSight's sole source of truth.
This directory is an explicitly generated, lossy interoperability format. It is not a native backup and is never synchronized or imported automatically.

## File formats

- **YAML** = exported current state / lookup data
- **JSONL** = exported time-series rows
- **Markdown** = exported prose with YAML frontmatter

## Files

- \`accounts.yaml\` — exported account metadata + nested open positions
- \`transactions.jsonl\` — exported transactions
- \`snapshots.jsonl\` — exported net-worth snapshots
- \`fx-rates.jsonl\` — exported (date, from, to, rate) rows
- \`reconciliations.jsonl\` — exported broker-vs-computed reconciliation rows
- \`decisions/YYYY-MM/<ulid>.md\` — exported decision entries

## Commands

- \`finsight ledger init <dir>\` — configure this optional legacy directory
- \`finsight ledger sync\` / \`export\` — explicitly export SQLite data here
- \`finsight ledger verify\` — compare exported row counts with SQLite
- \`finsight ledger restore --yes\` — explicit, lossy import that wipes supported SQLite tables

For recovery, use \`finsight backup create\` and verify the resulting native SQLite file with \`finsight backup verify <file>\`. Do not treat this ledger as canonical recovery.
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
