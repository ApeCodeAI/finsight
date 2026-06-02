import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { ledgerPaths } from "./paths.js";
import type {
  LedgerAccountsFile,
  LedgerFxRate,
  LedgerFxRatesFile,
  LedgerReconciliation,
  LedgerSnapshotFile,
  LedgerTransaction,
} from "./types.js";

export interface LedgerSnapshot {
  accountsFile: LedgerAccountsFile;
  fxRates: LedgerFxRate[];
  transactions: LedgerTransaction[];
  snapshots: LedgerSnapshotFile[];
  reconciliations: LedgerReconciliation[];
}

function readYamlIfExists<T>(file: string): T | null {
  if (!existsSync(file)) return null;
  return YAML.parse(readFileSync(file, "utf8")) as T;
}

function readJsonl<T>(file: string): T[] {
  if (!existsSync(file)) return [];
  const txt = readFileSync(file, "utf8");
  const out: T[] = [];
  for (const line of txt.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    try {
      out.push(JSON.parse(trimmed) as T);
    } catch {
      // Skip malformed lines but don't crash — let `finsight ledger verify` flag them.
    }
  }
  return out;
}

/**
 * Read snapshots, preferring `snapshots.jsonl`. Falls back to the legacy
 * `snapshots/*.json` folder so older vaults still load (then `ledger sync`
 * will rewrite as JSONL and remove the folder).
 */
function readSnapshots(p: ReturnType<typeof ledgerPaths>): LedgerSnapshotFile[] {
  if (existsSync(p.snapshots)) {
    const rows = readJsonl<LedgerSnapshotFile>(p.snapshots);
    if (rows.length > 0) {
      rows.sort((a, b) => a.date.localeCompare(b.date));
      return rows;
    }
  }
  // Legacy: one JSON file per snapshot in snapshots/.
  if (!existsSync(p.snapshotsLegacyDir)) return [];
  const out: LedgerSnapshotFile[] = [];
  for (const f of readdirSync(p.snapshotsLegacyDir)) {
    if (!f.endsWith(".json")) continue;
    const full = path.join(p.snapshotsLegacyDir, f);
    if (!statSync(full).isFile()) continue;
    try {
      out.push(JSON.parse(readFileSync(full, "utf8")) as LedgerSnapshotFile);
    } catch {
      // ignore
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

/**
 * Read FX, preferring `fx-rates.jsonl`. Falls back to the legacy yaml shape
 * (`{ rates: { USD: { CNY: 6.77 } } }`) and synthesizes today's date for
 * each pair, so old vaults still load.
 */
function readFxRates(p: ReturnType<typeof ledgerPaths>): LedgerFxRate[] {
  if (existsSync(p.fxRates)) {
    return readJsonl<LedgerFxRate>(p.fxRates);
  }
  const legacy = readYamlIfExists<LedgerFxRatesFile>(p.fxRatesLegacyYaml);
  if (!legacy?.rates) return [];
  const today = new Date().toISOString().slice(0, 10);
  const out: LedgerFxRate[] = [];
  for (const [from, byTo] of Object.entries(legacy.rates)) {
    for (const [to, rate] of Object.entries(byTo)) {
      out.push({ date: today, from, to, rate: rate as number });
    }
  }
  return out;
}

export function ensureLedgerSkeleton(root: string) {
  const p = ledgerPaths(root);
  mkdirSync(p.root, { recursive: true });
  mkdirSync(p.decisions, { recursive: true });
}

export function readLedger(root: string): LedgerSnapshot {
  const p = ledgerPaths(root);
  const accountsFile =
    readYamlIfExists<LedgerAccountsFile>(p.accounts) ?? {
      schema_version: 1,
      accounts: [],
    };
  return {
    accountsFile,
    fxRates: readFxRates(p),
    transactions: readJsonl<LedgerTransaction>(p.transactions),
    snapshots: readSnapshots(p),
    reconciliations: readJsonl<LedgerReconciliation>(p.reconciliations),
  };
}
