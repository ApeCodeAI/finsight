/**
 * Legacy plain-text interoperability schema. SQLite is FinSight's sole source
 * of truth; these types describe an explicitly exported/imported ledger.
 *
 * Format rules:
 *   - YAML   = stateful document or lookup dict (one current truth)
 *   - JSONL  = append-only time series (one immutable event per line)
 *   - MD     = prose body with YAML frontmatter
 *
 * Layout:
 *   ledger/
 *   ├── README.md
 *   ├── accounts.yaml          ← state (entities + nested positions)
 *   ├── transactions.jsonl     ← append-only event log
 *   ├── snapshots.jsonl        ← daily net-worth + per-account/position
 *   ├── fx-rates.jsonl         ← (date, from, to, rate) history
 *   ├── reconciliations.jsonl  ← broker-vs-computed reconciliation events
 *   └── decisions/YYYY-MM/<ulid>.md  ← prose + frontmatter
 *
 * This representation is intentionally retained for backwards compatibility
 * and is not a lossless native backup format.
 */

export const LEDGER_SCHEMA_VERSION = 1;

export interface LedgerPosition {
  symbol: string;
  name?: string;
  quantity: number;
  avg_cost: number;
  current_price: number;
  currency: string;
  tags?: string[];
  notes?: string;
  opened_at?: string;
  closed_at?: string;
}

export interface LedgerAccount {
  id: string;
  name: string;
  type: string;
  currency: string;
  institution?: string;
  tags?: string[];
  cash_balance: number;
  notes?: string;
  is_active?: boolean;
  positions?: LedgerPosition[];
}

export interface LedgerAccountsFile {
  schema_version: number;
  accounts: LedgerAccount[];
}

export interface LedgerFxRatesFile {
  schema_version: number;
  /** `from_currency -> to_currency -> rate`. Defaults base is CNY. */
  rates: Record<string, Record<string, number>>;
}

/** One line in fx-rates.jsonl. */
export interface LedgerFxRate {
  date: string; // YYYY-MM-DD
  from: string;
  to: string;
  rate: number;
}

/** One line in reconciliations.jsonl. */
export interface LedgerReconciliation {
  id: string;
  account_id: string;
  reconciled_at: string; // YYYY-MM-DD
  currency: string;
  computed_total: number;
  broker_total: number;
  delta: number;
  notes?: string | null;
}

export interface LedgerTransaction {
  id?: string;
  ts: string; // YYYY-MM-DD or ISO8601
  type: string;
  account_id: string;
  symbol?: string;
  qty?: number;
  price?: number;
  amount?: number;
  fee?: number;
  currency?: string;
  counterpart_account_id?: string;
  note?: string;
  braindump_id?: string;
}

export interface LedgerSnapshotAccount {
  account_id: string;
  account_name: string;
  cash_balance: number;
  currency: string;
  balance_base: number;
  positions?: Array<{
    symbol: string;
    name?: string | null;
    quantity: number;
    currency: string;
    value: number;
    value_base: number;
  }>;
}

export interface LedgerSnapshotFile {
  schema_version: number;
  date: string;
  total_net_worth: number;
  currency: string;
  notes?: string | null;
  accounts: LedgerSnapshotAccount[];
}
