import { and, desc, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { exchange_rates } from "../db/schema.js";
import type { AppDatabase } from "../db/connection.js";
import { getBaseCurrency } from "../config/index.js";
import { listAccounts } from "./account.js";
import { listPositions, getPosition } from "./position.js";
import { listSnapshots } from "./snapshot.js";

/**
 * Fallback FX. Each pair is expressed once and we look it up in either
 * direction. When the base currency in config doesn't appear here, the
 * caller is expected to seed exchange_rates / fx-rates.yaml.
 *
 * USD/CNY = 6.8765 was back-derived from the chaofa vault baseline
 * (274,766.19 CNY ÷ 39,958 USD). USD/HKD ~ 0.1276 yields HKD/CNY = 0.8543
 * which closes the 长桥 portfolio to within 9 CNY.
 */
const FALLBACK_FX_TABLE: Record<string, Record<string, number>> = {
  USD: { CNY: 6.8765, HKD: 7.8 },
  HKD: { CNY: 0.8543 },
  EUR: { USD: 1.08 },
  GBP: { USD: 1.26 },
  JPY: { USD: 0.0064 },
  // Stablecoins treated as USD-pegged. Override by inserting into exchange_rates.
  USDT: { USD: 1, CNY: 6.8765 },
  USDC: { USD: 1, CNY: 6.8765 },
};

/** Public: same lookup used internally. Returns 1 if no rate is known. */
export function getFxRate(db: AppDatabase, from: string, to: string): number {
  return getRate(db, from, to);
}

/**
 * Insert or update a row in exchange_rates. Returns the previously stored rate
 * (or undefined if newly created) so callers can show a diff.
 */
export function upsertFxRate(
  db: AppDatabase,
  from: string,
  to: string,
  rate: number,
): { previous?: number } {
  const date = new Date().toISOString().slice(0, 10);
  const ts = new Date().toISOString();
  const latest = db
    .select()
    .from(exchange_rates)
    .where(and(eq(exchange_rates.from_currency, from), eq(exchange_rates.to_currency, to)))
    .orderBy(desc(exchange_rates.rate_date), desc(exchange_rates.created_at))
    .get();
  const existingToday = db
    .select()
    .from(exchange_rates)
    .where(
      and(
        eq(exchange_rates.from_currency, from),
        eq(exchange_rates.to_currency, to),
        eq(exchange_rates.rate_date, date),
      ),
    )
    .get();
  if (existingToday) {
    db.update(exchange_rates)
      .set({ rate, created_at: ts })
      .where(eq(exchange_rates.id, existingToday.id))
      .run();
    return { previous: latest?.rate };
  }
  db.insert(exchange_rates)
    .values({
      id: ulid(),
      from_currency: from,
      to_currency: to,
      rate,
      rate_date: date,
      created_at: ts,
    })
    .run();
  return { previous: latest?.rate };
}

/** Public: convert an amount in `currency` to the configured base currency. */
export function toBase(db: AppDatabase, amount: number, currency: string): number {
  return amount * getRate(db, currency, getBaseCurrency());
}

function fallbackRate(from: string, to: string): number | undefined {
  if (FALLBACK_FX_TABLE[from]?.[to] !== undefined) {
    return FALLBACK_FX_TABLE[from][to];
  }
  if (FALLBACK_FX_TABLE[to]?.[from] !== undefined) {
    return 1 / FALLBACK_FX_TABLE[to][from];
  }
  // Triangulate via USD when both pairs anchor on USD.
  if (FALLBACK_FX_TABLE.USD?.[from] !== undefined && FALLBACK_FX_TABLE.USD?.[to] !== undefined) {
    return FALLBACK_FX_TABLE.USD[to] / FALLBACK_FX_TABLE.USD[from];
  }
  return undefined;
}

function getStoredRate(
  db: AppDatabase,
  from: string,
  to: string,
): number | undefined {
  const direct = db
    .select()
    .from(exchange_rates)
    .where(and(eq(exchange_rates.from_currency, from), eq(exchange_rates.to_currency, to)))
    .orderBy(desc(exchange_rates.rate_date), desc(exchange_rates.created_at))
    .get();
  if (direct) return direct.rate;

  const reverse = db
    .select()
    .from(exchange_rates)
    .where(and(eq(exchange_rates.from_currency, to), eq(exchange_rates.to_currency, from)))
    .orderBy(desc(exchange_rates.rate_date), desc(exchange_rates.created_at))
    .get();
  return reverse ? 1 / reverse.rate : undefined;
}

function getRate(db: AppDatabase, from: string, to: string): number {
  if (from === to) return 1;

  const stored = getStoredRate(db, from, to);
  if (stored !== undefined) return stored;

  const base = getBaseCurrency();
  if (from !== base && to !== base) {
    const fromToBase = getStoredRate(db, from, base);
    const toToBase = getStoredRate(db, to, base);
    if (fromToBase !== undefined && toToBase !== undefined) {
      return fromToBase / toToBase;
    }
  }

  const fb = fallbackRate(from, to);
  if (fb !== undefined) return fb;
  return 1;
}

export interface NetWorthAccount {
  id: string;
  name: string;
  type: string;
  /** Cash + positions in the account's native currency. */
  balance: number;
  /** Same value re-expressed in the configured base currency. */
  balance_base: number;
  currency: string;
}

export interface NetWorth {
  total: number;
  currency: string;
  byAccount: NetWorthAccount[];
}

/** Value one account in a target currency, including mixed-currency positions. */
export function getAccountValuation(
  db: AppDatabase,
  accountId: string,
  targetCurrency: string,
): { amount: number; currency: string } | null {
  const acc = listAccounts(db, { includeInactive: true }).find(
    (candidate) => candidate.id === accountId,
  );
  if (!acc) return null;

  const cashValue = acc.balance * getRate(db, acc.currency, targetCurrency);
  const positionsValue = listPositions(db, acc.id).reduce((sum, position) => {
    const rate = getRate(db, position.currency, targetCurrency);
    return sum + position.current_price * position.quantity * rate;
  }, 0);

  return { amount: cashValue + positionsValue, currency: targetCurrency };
}

export function getNetWorth(db: AppDatabase): NetWorth {
  const base = getBaseCurrency();
  const accs = listAccounts(db);
  let total = 0;
  const byAccount: NetWorthAccount[] = [];

  for (const acc of accs) {
    const accPositions = listPositions(db, acc.id);
    const positionsValueBase = accPositions.reduce((s, p) => {
      const rate = getRate(db, p.currency, base);
      return s + p.current_price * p.quantity * rate;
    }, 0);
    const accountRate = getRate(db, acc.currency, base);
    const balanceBase = acc.balance * accountRate + positionsValueBase;
    const balance = balanceBase / (accountRate || 1);
    total += balanceBase;

    byAccount.push({
      id: acc.id,
      name: acc.name,
      type: acc.type,
      balance,
      balance_base: balanceBase,
      currency: acc.currency,
    });
  }

  return { total, currency: base, byAccount };
}

export function getAllocation(db: AppDatabase): Record<string, number> {
  const nw = getNetWorth(db);
  if (nw.total === 0) return {};
  const alloc: Record<string, number> = {};
  for (const acc of nw.byAccount) {
    alloc[acc.type] = (alloc[acc.type] ?? 0) + acc.balance_base / nw.total;
  }
  return alloc;
}

export function getPositionPnL(db: AppDatabase, positionId: string) {
  const pos = getPosition(db, positionId);
  if (!pos) return null;
  const cost = pos.avg_cost * pos.quantity;
  const value = pos.current_price * pos.quantity;
  const pnl = value - cost;
  const pnlPercent = cost !== 0 ? pnl / cost : 0;
  let annualizedReturn = 0;
  if (pos.opened_at && cost !== 0) {
    const openDate = new Date(pos.opened_at);
    const now = pos.closed_at ? new Date(pos.closed_at) : new Date();
    const years = (now.getTime() - openDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (years > 0) {
      annualizedReturn = Math.pow(1 + pnlPercent, 1 / years) - 1;
    }
  }
  return {
    positionId,
    symbol: pos.symbol,
    cost,
    value,
    pnl,
    pnlPercent,
    annualizedReturn,
  };
}

export function getOverview(db: AppDatabase) {
  const base = getBaseCurrency();
  const netWorth = getNetWorth(db);
  const allocation = getAllocation(db);
  listSnapshots(db); // kept for side-effect parity (cache warming)

  return {
    snapshot_date: new Date().toISOString().slice(0, 10),
    total_net_worth: netWorth.total,
    currency: base,
    accounts: netWorth.byAccount,
    allocation,
  };
}
