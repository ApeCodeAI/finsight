import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";

// ── accounts ──────────────────────────────────────────────
export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(), // ULID
  name: text("name").notNull(),
  type: text("type").notNull(), // cash | brokerage | fund | crypto | business
  currency: text("currency").notNull().default("CNY"),
  institution: text("institution"),
  tags: text("tags"), // JSON array
  balance: real("balance").notNull().default(0),
  notes: text("notes"),
  is_active: integer("is_active").notNull().default(1),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
});

// ── positions ─────────────────────────────────────────────
export const positions = sqliteTable("positions", {
  id: text("id").primaryKey(),
  account_id: text("account_id").notNull(),
  symbol: text("symbol").notNull(),
  name: text("name"),
  quantity: real("quantity").notNull().default(0),
  avg_cost: real("avg_cost").notNull().default(0),
  current_price: real("current_price").notNull().default(0),
  currency: text("currency").notNull().default("CNY"),
  tags: text("tags"),
  notes: text("notes"),
  opened_at: text("opened_at"),
  closed_at: text("closed_at"),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
});

// ── transactions ──────────────────────────────────────────
export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  account_id: text("account_id").notNull(),
  position_id: text("position_id"),
  type: text("type").notNull(), // buy | sell | transfer_in | transfer_out | deposit | withdraw | dividend | interest
  amount: real("amount").notNull(),
  quantity: real("quantity"),
  price: real("price"),
  fee: real("fee").notNull().default(0),
  currency: text("currency").notNull().default("CNY"),
  counterpart_account_id: text("counterpart_account_id"),
  braindump_id: text("braindump_id"),
  notes: text("notes"),
  traded_at: text("traded_at").notNull(),
  created_at: text("created_at").notNull(),
  // ── Transparency / reconciliation ───────────────────────
  /**
   * Where the `price` value came from:
   *   user_provided   — user typed an explicit --price
   *   eod_close       — auto-fetched end-of-day close (fallback for stocks)
   *   eod_nav         — auto-fetched fund NAV from tiantian (mandatory for funds)
   *   realtime_quote  — quote pulled at trade time (intraday estimate)
   *   manual_entry    — back-filled by ledger import, source unknown
   */
  price_source: text("price_source"),
  /** ISO timestamp when the quote was fetched, if applicable. */
  quote_fetched_at: text("quote_fetched_at"),
  /**
   * 1 when the price is a fallback (e.g. user didn't supply --price on a stock
   * buy and we used today's close). User can later run
   * `finsight transaction confirm <id> --price <p>` to upgrade.
   */
  needs_review: integer("needs_review").notNull().default(0),
});

// ── decisions ─────────────────────────────────────────────
//  Investment decisions, theses, retrospectives, and daily notes — anything
//  the user wants to reason about that's *not* a price-changing event.
//  Stored in DB; `finsight ledger sync` mirrors each row to a markdown file
//  under `ledger/decisions/<date>-<slug>.md`.
export const decisions = sqliteTable("decisions", {
  id: text("id").primaryKey(),
  date: text("date").notNull(), // YYYY-MM-DD
  type: text("type").notNull(),
  // ^ rationale | target | stop-loss | rethink | retro | note
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  symbols: text("symbols"), // JSON array of tickers
  accounts: text("accounts"), // JSON array of account ids
  /** Optional 1:1 link to a transaction this decision documents. */
  transaction_id: text("transaction_id"),
  conviction: text("conviction"), // low | medium | high
  exit_target: real("exit_target"),
  stop_loss: real("stop_loss"),
  horizon: text("horizon"), // 1m | 3m | 12m | 3y
  tags: text("tags"), // JSON array
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
});

// ── targets ───────────────────────────────────────────────
//  Desired asset_class allocation. One row marked is_active at a time, but
//  history is retained for "I rebalanced toward X back in March" review.
export const targets = sqliteTable("targets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  is_active: integer("is_active").notNull().default(0),
  /** JSON array: [{ asset_class, weight, min?, max? }, ...] (weights sum to ~1). */
  allocations: text("allocations").notNull(),
  notes: text("notes"),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
});

// ── reconciliations ───────────────────────────────────────
//  One row per `finsight reconcile <account>` invocation. Lets the user track
//  drift between FinSight's computed balance and the broker app's display.
export const reconciliations = sqliteTable("reconciliations", {
  id: text("id").primaryKey(),
  account_id: text("account_id").notNull(),
  /** Date the user did the reconciliation (YYYY-MM-DD). */
  reconciled_at: text("reconciled_at").notNull(),
  /** Currency the broker_total is expressed in. */
  currency: text("currency").notNull(),
  /** What FinSight computed at that moment, in account currency. */
  computed_total: real("computed_total").notNull(),
  /** What the user reported the broker showed. */
  broker_total: real("broker_total").notNull(),
  /** broker_total - computed_total. */
  delta: real("delta").notNull(),
  notes: text("notes"),
  created_at: text("created_at").notNull(),
});

// ── snapshots ─────────────────────────────────────────────
export const snapshots = sqliteTable("snapshots", {
  id: text("id").primaryKey(),
  snapshot_date: text("snapshot_date").notNull(),
  total_net_worth: real("total_net_worth").notNull().default(0),
  data: text("data"), // JSON
  notes: text("notes"),
  created_at: text("created_at").notNull(),
});

// ── exchange_rates ────────────────────────────────────────
export const exchange_rates = sqliteTable("exchange_rates", {
  id: text("id").primaryKey(),
  from_currency: text("from_currency").notNull(),
  to_currency: text("to_currency").notNull(),
  rate: real("rate").notNull(),
  rate_date: text("rate_date").notNull(),
  created_at: text("created_at").notNull(),
});

