import { eq, desc } from "drizzle-orm";
import { ulid } from "ulid";
import { reconciliations } from "../db/schema.js";
import type { AppDatabase } from "../db/connection.js";

export interface RecordReconciliationInput {
  account_id: string;
  currency: string;
  computed_total: number;
  broker_total: number;
  /** YYYY-MM-DD; defaults to today */
  reconciled_at?: string;
  notes?: string;
}

export function recordReconciliation(
  db: AppDatabase,
  input: RecordReconciliationInput,
) {
  const id = ulid();
  const ts = new Date().toISOString();
  const row = {
    id,
    account_id: input.account_id,
    reconciled_at: input.reconciled_at ?? ts.slice(0, 10),
    currency: input.currency,
    computed_total: input.computed_total,
    broker_total: input.broker_total,
    delta: input.broker_total - input.computed_total,
    notes: input.notes ?? null,
    created_at: ts,
  };
  db.insert(reconciliations).values(row).run();
  return row;
}

export function listReconciliations(db: AppDatabase, accountId?: string) {
  const q = db.select().from(reconciliations);
  const filtered = accountId
    ? q.where(eq(reconciliations.account_id, accountId))
    : q;
  return filtered.orderBy(desc(reconciliations.reconciled_at)).all();
}
