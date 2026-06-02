import { eq, and } from "drizzle-orm";
import { ulid } from "ulid";
import { accounts } from "../db/schema.js";
import type { AppDatabase } from "../db/connection.js";
import { getBaseCurrency } from "../config/index.js";
import type { CreateAccountInput, EditAccountInput } from "../types.js";

function now() {
  return new Date().toISOString();
}

export function createAccount(db: AppDatabase, input: CreateAccountInput) {
  const id = ulid();
  const ts = now();
  const row = {
    id,
    name: input.name,
    type: input.type,
    currency: input.currency ?? getBaseCurrency(),
    institution: input.institution ?? null,
    tags: input.tags ? JSON.stringify(input.tags) : null,
    balance: input.balance ?? 0,
    notes: input.notes ?? null,
    is_active: 1,
    created_at: ts,
    updated_at: ts,
  };
  db.insert(accounts).values(row).run();
  return row;
}

export interface AccountFilters {
  type?: string;
  /** When true, archived accounts are included. Defaults to false. */
  includeInactive?: boolean;
  /**
   * @deprecated Use `includeInactive`. Legacy: 1 = active, 0 = archived,
   * undefined = both.
   */
  is_active?: number;
}

export function listAccounts(db: AppDatabase, filters?: AccountFilters) {
  const conditions = [];
  if (filters?.type) {
    conditions.push(eq(accounts.type, filters.type));
  }
  if (filters?.is_active !== undefined) {
    conditions.push(eq(accounts.is_active, filters.is_active));
  } else if (filters?.includeInactive !== true) {
    conditions.push(eq(accounts.is_active, 1));
  }

  if (conditions.length === 0) {
    return db.select().from(accounts).all();
  }
  return db
    .select()
    .from(accounts)
    .where(conditions.length === 1 ? conditions[0] : and(...conditions))
    .all();
}

export function getAccount(db: AppDatabase, id: string) {
  return db.select().from(accounts).where(eq(accounts.id, id)).get() ?? null;
}

export function editAccount(db: AppDatabase, id: string, updates: EditAccountInput) {
  const data: Record<string, unknown> = { updated_at: now() };
  if (updates.name !== undefined) data.name = updates.name;
  if (updates.type !== undefined) data.type = updates.type;
  if (updates.currency !== undefined) data.currency = updates.currency;
  if (updates.institution !== undefined) data.institution = updates.institution;
  if (updates.tags !== undefined) data.tags = JSON.stringify(updates.tags);
  if (updates.balance !== undefined) data.balance = updates.balance;
  if (updates.notes !== undefined) data.notes = updates.notes;

  db.update(accounts).set(data).where(eq(accounts.id, id)).run();
  return getAccount(db, id);
}

export function archiveAccount(db: AppDatabase, id: string) {
  db.update(accounts).set({ is_active: 0, updated_at: now() }).where(eq(accounts.id, id)).run();
}

export function updateBalance(db: AppDatabase, id: string, amount: number, note?: string) {
  const data: Record<string, unknown> = { balance: amount, updated_at: now() };
  if (note !== undefined) data.notes = note;
  db.update(accounts).set(data).where(eq(accounts.id, id)).run();
  return getAccount(db, id);
}
