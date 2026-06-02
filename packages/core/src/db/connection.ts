import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema.js";
import { getDbPath as configDbPath } from "../config/index.js";

const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CNY',
  institution TEXT,
  tags TEXT,
  balance REAL NOT NULL DEFAULT 0,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS positions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT,
  quantity REAL NOT NULL DEFAULT 0,
  avg_cost REAL NOT NULL DEFAULT 0,
  current_price REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'CNY',
  tags TEXT,
  notes TEXT,
  opened_at TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  position_id TEXT,
  type TEXT NOT NULL,
  amount REAL NOT NULL,
  quantity REAL,
  price REAL,
  fee REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'CNY',
  counterpart_account_id TEXT,
  braindump_id TEXT,
  notes TEXT,
  traded_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  price_source TEXT,
  quote_fetched_at TEXT,
  needs_review INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY,
  snapshot_date TEXT NOT NULL,
  total_net_worth REAL NOT NULL DEFAULT 0,
  data TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS exchange_rates (
  id TEXT PRIMARY KEY,
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL,
  rate REAL NOT NULL,
  rate_date TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  symbols TEXT,
  accounts TEXT,
  transaction_id TEXT,
  conviction TEXT,
  exit_target REAL,
  stop_loss REAL,
  horizon TEXT,
  tags TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS targets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  allocations TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reconciliations (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  reconciled_at TEXT NOT NULL,
  currency TEXT NOT NULL,
  computed_total REAL NOT NULL,
  broker_total REAL NOT NULL,
  delta REAL NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL
);
`;

export type AppDatabase = ReturnType<typeof createDb>;

function createDb(sqlite: InstanceType<typeof Database>) {
  return drizzle(sqlite, { schema });
}

/**
 * Idempotent migrations for older DBs:
 *  - add columns that newer code expects (SQLite supports ALTER TABLE ADD COLUMN)
 *  - drop tables for features that have been removed (so verify/restore stay clean)
 */
function applyMigrations(sqlite: InstanceType<typeof Database>) {
  const cols = sqlite
    .prepare("PRAGMA table_info(transactions)")
    .all() as Array<{ name: string }>;
  const have = new Set(cols.map((c) => c.name));
  if (!have.has("price_source")) {
    sqlite.exec("ALTER TABLE transactions ADD COLUMN price_source TEXT");
  }
  if (!have.has("quote_fetched_at")) {
    sqlite.exec("ALTER TABLE transactions ADD COLUMN quote_fetched_at TEXT");
  }
  if (!have.has("needs_review")) {
    sqlite.exec(
      "ALTER TABLE transactions ADD COLUMN needs_review INTEGER NOT NULL DEFAULT 0",
    );
  }
  // Removed features — drop their tables so they don't linger in old DBs.
  // FinSight is a portfolio tracker; budgeting belongs in YNAB/Beancount/etc.
  sqlite.exec("DROP TABLE IF EXISTS incomes");
  sqlite.exec("DROP TABLE IF EXISTS monthly_expenses");
}

/** Push schema (CREATE TABLE IF NOT EXISTS) to the given better-sqlite3 instance. */
export function pushSchema(sqlite: InstanceType<typeof Database>) {
  sqlite.exec(CREATE_TABLES_SQL);
  applyMigrations(sqlite);
}

/** Create an in-memory database (for tests). */
export function getTestDb() {
  const sqlite = new Database(":memory:");
  pushSchema(sqlite);
  return createDb(sqlite);
}

/**
 * Get the production Drizzle database instance.
 * Path resolution mirrors config.getDbPath() (FINSIGHT_DB_PATH > config > default).
 * Auto-creates the parent directory and pushes schema on first run.
 */
export function getDb(dbPath?: string) {
  const resolvedPath = dbPath ?? configDbPath();
  mkdirSync(dirname(resolvedPath), { recursive: true });
  const sqlite = new Database(resolvedPath);
  sqlite.pragma("journal_mode = WAL");
  pushSchema(sqlite);
  return createDb(sqlite);
}
