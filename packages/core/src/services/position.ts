import { eq, and, isNull } from "drizzle-orm";
import { ulid } from "ulid";
import { positions } from "../db/schema.js";
import type { AppDatabase } from "../db/connection.js";
import type { CreatePositionInput } from "../types.js";

function now() {
  return new Date().toISOString();
}

export function createPosition(db: AppDatabase, input: CreatePositionInput) {
  const id = ulid();
  const ts = now();
  const row = {
    id,
    account_id: input.account_id,
    symbol: input.symbol,
    name: input.name ?? null,
    quantity: input.quantity,
    avg_cost: input.avg_cost,
    current_price: input.current_price ?? input.avg_cost,
    currency: input.currency ?? "CNY",
    tags: input.tags ? JSON.stringify(input.tags) : null,
    notes: input.notes ?? null,
    opened_at: ts,
    closed_at: null,
    created_at: ts,
    updated_at: ts,
  };
  db.insert(positions).values(row).run();
  return row;
}

export function listPositions(db: AppDatabase, accountId?: string) {
  if (accountId) {
    return db
      .select()
      .from(positions)
      .where(
        and(
          eq(positions.account_id, accountId),
          isNull(positions.closed_at)
        )
      )
      .all();
  }
  return db
    .select()
    .from(positions)
    .where(isNull(positions.closed_at))
    .all();
}

export function getPosition(db: AppDatabase, id: string) {
  return db.select().from(positions).where(eq(positions.id, id)).get() ?? null;
}

export function findOpenPosition(
  db: AppDatabase,
  accountId: string,
  symbol: string
) {
  return (
    db
      .select()
      .from(positions)
      .where(
        and(
          eq(positions.account_id, accountId),
          eq(positions.symbol, symbol),
          isNull(positions.closed_at)
        )
      )
      .get() ?? null
  );
}

/**
 * Update `current_price` for every open position holding the given symbol.
 * Returns the number of rows touched.
 */
export function updatePriceBySymbol(
  db: AppDatabase,
  symbol: string,
  price: number,
): { updated: number; old_prices: number[] } {
  const rows = db
    .select()
    .from(positions)
    .where(eq(positions.symbol, symbol))
    .all();
  if (rows.length === 0) return { updated: 0, old_prices: [] };
  const ts = now();
  db.update(positions)
    .set({ current_price: price, updated_at: ts })
    .where(eq(positions.symbol, symbol))
    .run();
  return { updated: rows.length, old_prices: rows.map((r) => r.current_price) };
}

export function updatePrice(db: AppDatabase, id: string, price: number) {
  db.update(positions)
    .set({ current_price: price, updated_at: now() })
    .where(eq(positions.id, id))
    .run();
  return getPosition(db, id);
}

export function closePosition(db: AppDatabase, id: string) {
  const ts = now();
  db.update(positions)
    .set({ closed_at: ts, updated_at: ts })
    .where(eq(positions.id, id))
    .run();
  return getPosition(db, id);
}

/**
 * Internal: update position quantity and avg_cost after a buy.
 */
export function addToPosition(
  db: AppDatabase,
  id: string,
  addQty: number,
  buyPrice: number
) {
  const pos = getPosition(db, id)!;
  const totalCost = pos.avg_cost * pos.quantity + buyPrice * addQty;
  const newQty = pos.quantity + addQty;
  const newAvg = newQty > 0 ? totalCost / newQty : 0;
  db.update(positions)
    .set({ quantity: newQty, avg_cost: newAvg, updated_at: now() })
    .where(eq(positions.id, id))
    .run();
  return getPosition(db, id);
}

/**
 * Internal: reduce position quantity after a sell.
 */
export function reducePosition(db: AppDatabase, id: string, sellQty: number) {
  const pos = getPosition(db, id)!;
  const newQty = pos.quantity - sellQty;
  const updates: Record<string, unknown> = {
    quantity: newQty,
    updated_at: now(),
  };
  if (newQty <= 0) {
    updates.closed_at = now();
    updates.quantity = 0;
  }
  db.update(positions).set(updates).where(eq(positions.id, id)).run();
  return getPosition(db, id);
}
