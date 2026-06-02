import { eq, and, gte, lte } from "drizzle-orm";
import { ulid } from "ulid";
import { accounts, transactions } from "../db/schema.js";
import type { AppDatabase } from "../db/connection.js";
import { getBaseCurrency } from "../config/index.js";
import type {
  RecordBuyInput,
  RecordSellInput,
  TransactionFilter,
} from "../types.js";
import {
  createPosition,
  findOpenPosition,
  addToPosition,
  reducePosition,
} from "./position.js";

function now() {
  return new Date().toISOString();
}

/** Provenance of a transaction's `price` field. See schema for semantics. */
export type PriceSource =
  | "user_provided"
  | "eod_close"
  | "eod_nav"
  | "realtime_quote"
  | "manual_entry";

export interface RecordBuyExtras {
  /** Where the price came from. Defaults to "user_provided" for back-compat. */
  price_source?: PriceSource;
  /** ISO timestamp of when the quote was fetched, if applicable. */
  quote_fetched_at?: string;
  /** 1 when the price is a fallback the user should confirm later. */
  needs_review?: 0 | 1;
}

export function recordBuy(
  db: AppDatabase,
  input: RecordBuyInput & RecordBuyExtras,
) {
  const id = ulid();
  const ts = now();
  const tradedAt = input.traded_at ?? ts;
  const amount = input.quantity * input.price;
  const fee = input.fee ?? 0;

  let pos = findOpenPosition(db, input.account_id, input.symbol);
  if (pos) {
    addToPosition(db, pos.id, input.quantity, input.price);
  } else {
    pos = createPosition(db, {
      account_id: input.account_id,
      symbol: input.symbol,
      name: input.name,
      quantity: input.quantity,
      avg_cost: input.price,
      current_price: input.price,
      currency: input.currency,
    });
  }

  const row = {
    id,
    account_id: input.account_id,
    position_id: pos.id,
    type: "buy" as const,
    amount,
    quantity: input.quantity,
    price: input.price,
    fee,
    currency: input.currency ?? getBaseCurrency(),
    counterpart_account_id: null,
    braindump_id: null,
    notes: input.notes ?? null,
    traded_at: tradedAt,
    created_at: ts,
    price_source: input.price_source ?? "user_provided",
    quote_fetched_at: input.quote_fetched_at ?? null,
    needs_review: input.needs_review ?? 0,
  };
  db.insert(transactions).values(row).run();
  return row;
}

export function recordSell(
  db: AppDatabase,
  input: RecordSellInput & RecordBuyExtras,
) {
  const id = ulid();
  const ts = now();
  const tradedAt = input.traded_at ?? ts;
  const amount = input.quantity * input.price;
  const fee = input.fee ?? 0;

  const pos = findOpenPosition(db, input.account_id, input.symbol);
  if (!pos) {
    throw new Error(
      `No open position found for ${input.symbol} in account ${input.account_id}`,
    );
  }
  reducePosition(db, pos.id, input.quantity);

  const row = {
    id,
    account_id: input.account_id,
    position_id: pos.id,
    type: "sell" as const,
    amount,
    quantity: input.quantity,
    price: input.price,
    fee,
    currency: input.currency ?? getBaseCurrency(),
    counterpart_account_id: null,
    braindump_id: null,
    notes: input.notes ?? null,
    traded_at: tradedAt,
    created_at: ts,
    price_source: input.price_source ?? "user_provided",
    quote_fetched_at: input.quote_fetched_at ?? null,
    needs_review: input.needs_review ?? 0,
  };
  db.insert(transactions).values(row).run();
  return row;
}

/** Mark a transaction as confirmed (needs_review = 0) and optionally overwrite price. */
export function confirmTransaction(
  db: AppDatabase,
  id: string,
  newPrice?: number,
): { updated: number } {
  const existing = db.select().from(transactions).where(eq(transactions.id, id)).get();
  if (!existing) return { updated: 0 };
  const updates: Record<string, unknown> = { needs_review: 0 };
  if (newPrice != null && existing.quantity != null) {
    updates.price = newPrice;
    updates.amount = newPrice * existing.quantity;
    updates.price_source = "user_provided";
  }
  db.update(transactions).set(updates).where(eq(transactions.id, id)).run();
  return { updated: 1 };
}

/** All transactions still flagged needs_review = 1. */
export function listPendingReview(db: AppDatabase) {
  return db.select().from(transactions).where(eq(transactions.needs_review, 1)).all();
}

export function recordTransfer(
  db: AppDatabase,
  fromAccountId: string,
  toAccountId: string,
  amount: number,
  note?: string
) {
  const ts = now();
  const outId = ulid();
  const inId = ulid();

  const outRow = {
    id: outId,
    account_id: fromAccountId,
    position_id: null,
    type: "transfer_out" as const,
    amount,
    quantity: null,
    price: null,
    fee: 0,
    currency: "CNY",
    counterpart_account_id: toAccountId,
    braindump_id: null,
    notes: note ?? null,
    traded_at: ts,
    created_at: ts,
  };
  const inRow = {
    id: inId,
    account_id: toAccountId,
    position_id: null,
    type: "transfer_in" as const,
    amount,
    quantity: null,
    price: null,
    fee: 0,
    currency: "CNY",
    counterpart_account_id: fromAccountId,
    braindump_id: null,
    notes: note ?? null,
    traded_at: ts,
    created_at: ts,
  };

  db.insert(transactions).values(outRow).run();
  db.insert(transactions).values(inRow).run();
  return [outRow, inRow] as const;
}

export interface RecordCashflowInput {
  account_id: string;
  /** Always positive; sign is implied by the function (deposit / withdraw). */
  amount: number;
  /** Defaults to the account's currency. */
  currency?: string;
  /** YYYY-MM-DD; defaults to today. */
  traded_at?: string;
  note?: string;
}

function recordCashflow(
  db: AppDatabase,
  type: "deposit" | "withdraw",
  input: RecordCashflowInput,
) {
  if (input.amount <= 0) {
    throw new Error(`amount must be positive (got ${input.amount})`);
  }
  // Resolve account currency if not provided.
  let currency = input.currency;
  if (!currency) {
    const acc = db
      .select()
      .from(accounts)
      .where(eq(accounts.id, input.account_id))
      .get();
    currency = acc?.currency ?? "CNY";
  }
  const id = ulid();
  const ts = now();
  // Schema convention: positive amount = deposit (money in),
  // negative amount = withdraw (money out).
  const signedAmount = type === "deposit" ? input.amount : -input.amount;
  const row = {
    id,
    account_id: input.account_id,
    position_id: null,
    type,
    amount: signedAmount,
    quantity: null,
    price: null,
    fee: 0,
    currency,
    counterpart_account_id: null,
    braindump_id: null,
    notes: input.note ?? null,
    traded_at: input.traded_at ?? ts.slice(0, 10),
    created_at: ts,
  };
  db.insert(transactions).values(row).run();
  return row;
}

export function recordDeposit(db: AppDatabase, input: RecordCashflowInput) {
  return recordCashflow(db, "deposit", input);
}

export function recordWithdraw(db: AppDatabase, input: RecordCashflowInput) {
  return recordCashflow(db, "withdraw", input);
}

export function listTransactions(
  db: AppDatabase,
  filters?: TransactionFilter
) {
  const conditions = [];
  if (filters?.account_id) {
    conditions.push(eq(transactions.account_id, filters.account_id));
  }
  if (filters?.type) {
    conditions.push(eq(transactions.type, filters.type));
  }
  if (filters?.from) {
    conditions.push(gte(transactions.traded_at, filters.from));
  }
  if (filters?.to) {
    conditions.push(lte(transactions.traded_at, filters.to));
  }

  if (conditions.length === 0) {
    return db.select().from(transactions).all();
  }
  return db
    .select()
    .from(transactions)
    .where(conditions.length === 1 ? conditions[0] : and(...conditions))
    .all();
}
