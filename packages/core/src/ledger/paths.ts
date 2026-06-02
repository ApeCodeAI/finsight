import path from "node:path";

/**
 * Vault ledger paths. Config access (ledger_dir / readConfig / writeConfig)
 * lives in `core/config/index.ts` — keep this file pure path arithmetic.
 */

export interface LedgerPaths {
  root: string;
  accounts: string;
  /** Legacy YAML file with flattened rates (no date). Kept for read-side migration. */
  fxRatesLegacyYaml: string;
  fxRates: string;
  transactions: string;
  /** Legacy folder with per-day snapshot JSONs. Kept for read-side migration. */
  snapshotsLegacyDir: string;
  snapshots: string;
  reconciliations: string;
  decisions: string;
  readme: string;
}

export function ledgerPaths(root: string): LedgerPaths {
  return {
    root,
    accounts: path.join(root, "accounts.yaml"),
    fxRatesLegacyYaml: path.join(root, "fx-rates.yaml"),
    fxRates: path.join(root, "fx-rates.jsonl"),
    transactions: path.join(root, "transactions.jsonl"),
    snapshotsLegacyDir: path.join(root, "snapshots"),
    snapshots: path.join(root, "snapshots.jsonl"),
    reconciliations: path.join(root, "reconciliations.jsonl"),
    decisions: path.join(root, "decisions"),
    readme: path.join(root, "README.md"),
  };
}

export function decisionsDir(root: string): string {
  return ledgerPaths(root).decisions;
}

// Re-export config accessors so existing imports keep working during refactor.
export {
  readConfig,
  writeConfig,
  getLedgerDir,
  isLedgerConfigured,
} from "../config/index.js";
