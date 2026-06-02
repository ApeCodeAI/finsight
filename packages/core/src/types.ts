// ── Enum-like union types ─────────────────────────────────
export type AccountType =
  | "cash"
  | "bank"
  | "brokerage"
  | "fund"
  | "exchange"
  | "crypto"
  | "business"
  | "other";
export type TransactionType =
  | "buy"
  | "sell"
  | "transfer_in"
  | "transfer_out"
  | "deposit"
  | "withdraw"
  | "dividend"
  | "interest";
export type Currency = "CNY" | "USD" | "HKD" | "EUR" | "GBP" | "JPY";

// ── Input types ───────────────────────────────────────────
export interface CreateAccountInput {
  name: string;
  type: AccountType;
  currency?: Currency | string;
  institution?: string;
  tags?: string[];
  balance?: number;
  notes?: string;
}

export interface EditAccountInput {
  name?: string;
  type?: AccountType;
  currency?: Currency | string;
  institution?: string;
  tags?: string[];
  balance?: number;
  notes?: string;
}

export interface CreatePositionInput {
  account_id: string;
  symbol: string;
  name?: string;
  quantity: number;
  avg_cost: number;
  current_price?: number;
  currency?: Currency | string;
  tags?: string[];
  notes?: string;
}

export interface RecordBuyInput {
  account_id: string;
  symbol: string;
  name?: string;
  quantity: number;
  price: number;
  fee?: number;
  currency?: Currency | string;
  notes?: string;
  traded_at?: string;
}

export interface RecordSellInput {
  account_id: string;
  symbol: string;
  quantity: number;
  price: number;
  fee?: number;
  currency?: Currency | string;
  notes?: string;
  traded_at?: string;
}

export interface TransactionFilter {
  account_id?: string;
  symbol?: string;
  type?: TransactionType;
  from?: string;
  to?: string;
}

export interface SnapshotDiff {
  date1: string;
  date2: string;
  totalChange: number;
  totalChangePercent: number;
  byAccount: Array<{
    account_id: string;
    account_name: string;
    balance1: number;
    balance2: number;
    change: number;
  }>;
}

export interface ImportResult {
  accountId: string;
  accountName: string;
  snapshotsCreated: number;
  snapshotsSkipped: number;
  /** Deposit/withdraw events recovered from `转入转出` rows. */
  transactionsCreated: number;
  transactionsSkipped: number;
}
