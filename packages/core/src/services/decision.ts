import { eq, and, desc, like, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { decisions, transactions } from "../db/schema.js";
import type { AppDatabase } from "../db/connection.js";

export type DecisionType =
  | "rationale" // why I'm entering this position
  | "target" // exit price / take-profit
  | "stop-loss" // exit if it falls below
  | "rethink" // mid-flight reassessment
  | "retro" // post-close review
  | "note"; // daily thinking, no commitment

export type Conviction = "low" | "medium" | "high";
export type Horizon = "1m" | "3m" | "12m" | "3y";

export interface DecisionRow {
  id: string;
  date: string;
  type: DecisionType;
  title: string;
  body: string;
  symbols: string[];
  accounts: string[];
  transaction_id: string | null;
  conviction: Conviction | null;
  exit_target: number | null;
  stop_loss: number | null;
  horizon: Horizon | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateDecisionInput {
  date?: string; // defaults to today
  type: DecisionType;
  title?: string; // derived if absent
  body?: string;
  symbols?: string[];
  accounts?: string[];
  transaction_id?: string;
  conviction?: Conviction;
  exit_target?: number;
  stop_loss?: number;
  horizon?: Horizon;
  tags?: string[];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function deriveTitle(input: CreateDecisionInput): string {
  if (input.title && input.title.trim().length > 0) return input.title.trim();
  const subj = input.symbols?.[0] ?? input.accounts?.[0] ?? "note";
  return `${input.date ?? today()} ${subj} ${input.type}`;
}

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
}

function rowToDecision(r: typeof decisions.$inferSelect): DecisionRow {
  return {
    id: r.id,
    date: r.date,
    type: r.type as DecisionType,
    title: r.title,
    body: r.body,
    symbols: parseJsonArray(r.symbols),
    accounts: parseJsonArray(r.accounts),
    transaction_id: r.transaction_id,
    conviction: (r.conviction as Conviction | null) ?? null,
    exit_target: r.exit_target,
    stop_loss: r.stop_loss,
    horizon: (r.horizon as Horizon | null) ?? null,
    tags: parseJsonArray(r.tags),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function createDecision(
  db: AppDatabase,
  input: CreateDecisionInput,
): DecisionRow {
  const id = ulid();
  const ts = new Date().toISOString();
  const row = {
    id,
    date: input.date ?? today(),
    type: input.type,
    title: deriveTitle(input),
    body: input.body ?? "",
    symbols: input.symbols && input.symbols.length > 0 ? JSON.stringify(input.symbols) : null,
    accounts: input.accounts && input.accounts.length > 0 ? JSON.stringify(input.accounts) : null,
    transaction_id: input.transaction_id ?? null,
    conviction: input.conviction ?? null,
    exit_target: input.exit_target ?? null,
    stop_loss: input.stop_loss ?? null,
    horizon: input.horizon ?? null,
    tags: input.tags && input.tags.length > 0 ? JSON.stringify(input.tags) : null,
    created_at: ts,
    updated_at: ts,
  };
  db.insert(decisions).values(row).run();
  return rowToDecision(row as typeof decisions.$inferSelect);
}

export interface ListDecisionFilter {
  symbol?: string;
  account?: string;
  type?: DecisionType;
  transaction_id?: string;
  tag?: string;
  /** YYYY-MM-DD or YYYY-MM */
  since?: string;
}

export function listDecisions(
  db: AppDatabase,
  filter: ListDecisionFilter = {},
): DecisionRow[] {
  // SQLite doesn't have a real JSON contains operator without json_extract, so
  // we use LIKE on the serialized array — symbols are ULIDs / tickers without
  // commas inside, so this is unambiguous.
  const conditions = [];
  if (filter.type) conditions.push(eq(decisions.type, filter.type));
  if (filter.transaction_id) {
    conditions.push(eq(decisions.transaction_id, filter.transaction_id));
  }
  if (filter.symbol) {
    conditions.push(like(decisions.symbols, `%"${filter.symbol}"%`));
  }
  if (filter.account) {
    conditions.push(like(decisions.accounts, `%"${filter.account}"%`));
  }
  if (filter.tag) {
    conditions.push(like(decisions.tags, `%"${filter.tag}"%`));
  }
  if (filter.since) {
    conditions.push(sql`${decisions.date} >= ${filter.since}`);
  }
  let q = db.select().from(decisions);
  if (conditions.length === 1) q = q.where(conditions[0]) as typeof q;
  else if (conditions.length > 1) q = q.where(and(...conditions)) as typeof q;
  const rows = q.orderBy(desc(decisions.date), desc(decisions.created_at)).all();
  return rows.map(rowToDecision);
}

export function getDecision(db: AppDatabase, id: string): DecisionRow | null {
  const r = db.select().from(decisions).where(eq(decisions.id, id)).get();
  return r ? rowToDecision(r) : null;
}

export interface UpdateDecisionInput {
  date?: string;
  type?: DecisionType;
  title?: string;
  body?: string;
  symbols?: string[];
  accounts?: string[];
  transaction_id?: string | null;
  conviction?: Conviction | null;
  exit_target?: number | null;
  stop_loss?: number | null;
  horizon?: Horizon | null;
  tags?: string[];
}

export function updateDecision(
  db: AppDatabase,
  id: string,
  updates: UpdateDecisionInput,
): DecisionRow | null {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.date !== undefined) patch.date = updates.date;
  if (updates.type !== undefined) patch.type = updates.type;
  if (updates.title !== undefined) patch.title = updates.title;
  if (updates.body !== undefined) patch.body = updates.body;
  if (updates.symbols !== undefined) {
    patch.symbols = updates.symbols.length > 0 ? JSON.stringify(updates.symbols) : null;
  }
  if (updates.accounts !== undefined) {
    patch.accounts = updates.accounts.length > 0 ? JSON.stringify(updates.accounts) : null;
  }
  if (updates.transaction_id !== undefined) patch.transaction_id = updates.transaction_id;
  if (updates.conviction !== undefined) patch.conviction = updates.conviction;
  if (updates.exit_target !== undefined) patch.exit_target = updates.exit_target;
  if (updates.stop_loss !== undefined) patch.stop_loss = updates.stop_loss;
  if (updates.horizon !== undefined) patch.horizon = updates.horizon;
  if (updates.tags !== undefined) {
    patch.tags = updates.tags.length > 0 ? JSON.stringify(updates.tags) : null;
  }
  db.update(decisions).set(patch).where(eq(decisions.id, id)).run();
  return getDecision(db, id);
}

export function deleteDecision(db: AppDatabase, id: string): { deleted: number } {
  const existing = db.select().from(decisions).where(eq(decisions.id, id)).get();
  if (!existing) return { deleted: 0 };
  db.delete(decisions).where(eq(decisions.id, id)).run();
  return { deleted: 1 };
}

/* ─────────────────────────────────────────────────────────────────────────
   "Need a rationale" — surface buy/sell transactions without an attached
   rationale-type decision. Used by `finsight decision review`.
   ─────────────────────────────────────────────────────────────────────── */

export interface NeedsRationaleRow {
  transaction_id: string;
  traded_at: string;
  type: string;
  account_id: string;
  price: number | null;
  quantity: number | null;
  notes: string | null;
}

export function listTransactionsNeedingRationale(
  db: AppDatabase,
): NeedsRationaleRow[] {
  // A buy/sell transaction needs a rationale if no decision with
  // type="rationale" links back to it.
  const all = db
    .select()
    .from(transactions)
    .where(sql`${transactions.type} IN ('buy','sell')`)
    .all();
  if (all.length === 0) return [];
  const linked = db
    .select({ tx: decisions.transaction_id })
    .from(decisions)
    .where(eq(decisions.type, "rationale"))
    .all();
  const linkedSet = new Set(linked.map((r) => r.tx).filter(Boolean) as string[]);
  return all
    .filter((t) => !linkedSet.has(t.id))
    .map((t) => ({
      transaction_id: t.id,
      traded_at: t.traded_at,
      type: t.type,
      account_id: t.account_id,
      price: t.price,
      quantity: t.quantity,
      notes: t.notes,
    }))
    .sort((a, b) => b.traded_at.localeCompare(a.traded_at));
}

/* ─────────────────────────────────────────────────────────────────────────
   Target / stop-loss checker
   ─────────────────────────────────────────────────────────────────────── */

export interface DecisionAlert {
  decision_id: string;
  symbol: string;
  kind: "exit_target" | "stop_loss";
  threshold: number;
  current_price: number;
  triggered: boolean;
  decision_title: string;
}

/**
 * For every active decision with an exit_target or stop_loss, check if the
 * current price in any open position crosses the threshold.
 *
 * "Active" = decision.type in ("rationale","target","stop-loss","rethink")
 * with a symbol and at least one currently-open position for that symbol.
 */
export function checkDecisionTriggers(db: AppDatabase): DecisionAlert[] {
  const candidates = db
    .select()
    .from(decisions)
    .where(
      sql`${decisions.type} IN ('rationale','target','stop-loss','rethink')
          AND (${decisions.exit_target} IS NOT NULL OR ${decisions.stop_loss} IS NOT NULL)`,
    )
    .all();
  const out: DecisionAlert[] = [];
  for (const d of candidates) {
    const syms = parseJsonArray(d.symbols);
    if (syms.length === 0) continue;
    for (const sym of syms) {
      const pos = db
        .select()
        .from(transactions) // placeholder — we use positions table
        .all();
      void pos;
      // Look up current price from positions table directly to avoid pulling
      // the whole module graph here.
      const priceRow = db
        .select({ p: sql<number>`MAX(current_price)` })
        .from(sql`positions`)
        .where(sql`symbol = ${sym} AND closed_at IS NULL`)
        .get();
      const price = priceRow?.p;
      if (typeof price !== "number" || price === 0) continue;
      if (d.exit_target != null) {
        out.push({
          decision_id: d.id,
          symbol: sym,
          kind: "exit_target",
          threshold: d.exit_target,
          current_price: price,
          triggered: price >= d.exit_target,
          decision_title: d.title,
        });
      }
      if (d.stop_loss != null) {
        out.push({
          decision_id: d.id,
          symbol: sym,
          kind: "stop_loss",
          threshold: d.stop_loss,
          current_price: price,
          triggered: price <= d.stop_loss,
          decision_title: d.title,
        });
      }
    }
  }
  return out;
}
