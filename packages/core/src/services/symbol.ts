import { eq } from "drizzle-orm";
import { positions } from "../db/schema.js";
import type { AppDatabase } from "../db/connection.js";
import { listAccounts } from "./account.js";
import { listPositions } from "./position.js";
import { getNetWorth, toBase } from "./analytics.js";
import { classifyPosition, type AssetClass } from "./asset-class.js";

/**
 * Per-account leg of a symbol. Native-currency fields describe the trade as
 * the user sees it on the broker; base-currency fields are FX-normalized so
 * cross-account aggregation is meaningful.
 */
export interface SymbolAccountLeg {
  account_id: string;
  account_name: string;
  position_id: string;
  quantity: number;
  avg_cost: number;
  current_price: number;
  currency: string;
  market_value: number;
  cost_basis: number;
  pnl: number;
  pnl_pct: number;
  market_value_base: number;
  cost_basis_base: number;
  pnl_base: number;
  fx_to_base: number;
}

export interface SymbolAggregate {
  symbol: string;
  /** Best-effort display name (taken from the first leg with a name). */
  name: string | null;
  /** Currencies seen across all legs. Most symbols have exactly one. */
  currencies: string[];
  /** Primary currency (the one most legs use). Useful for display. */
  primary_currency: string;
  /** Coarse asset class derived from symbol + currency + tags. */
  asset_class: AssetClass;
  total_quantity: number;
  /** Quantity-weighted average cost in primary currency. */
  avg_cost: number;
  /** Current price in primary currency (taken from first matching-ccy leg). */
  current_price: number | null;
  /** Native-currency totals only meaningful when all legs share currency. */
  market_value_native: number | null;
  cost_basis_native: number | null;
  pnl_native: number | null;
  /** Base-currency totals (always defined). */
  market_value_base: number;
  cost_basis_base: number;
  pnl_base: number;
  pnl_pct_base: number;
  /** Fraction of overall net worth. 0..1 */
  portfolio_weight: number;
  /** Number of accounts holding this symbol. */
  account_count: number;
}

export interface SymbolDetail extends SymbolAggregate {
  legs: SymbolAccountLeg[];
}

function buildLeg(
  db: AppDatabase,
  position: ReturnType<typeof listPositions>[number],
  accountName: string,
): SymbolAccountLeg {
  const value = position.current_price * position.quantity;
  const cost = position.avg_cost * position.quantity;
  const fx = toBase(db, 1, position.currency);
  return {
    account_id: position.account_id,
    account_name: accountName,
    position_id: position.id,
    quantity: position.quantity,
    avg_cost: position.avg_cost,
    current_price: position.current_price,
    currency: position.currency,
    market_value: value,
    cost_basis: cost,
    pnl: value - cost,
    pnl_pct: cost !== 0 ? (value - cost) / cost : 0,
    market_value_base: value * fx,
    cost_basis_base: cost * fx,
    pnl_base: (value - cost) * fx,
    fx_to_base: fx,
  };
}

function summarizeLegs(symbol: string, legs: SymbolAccountLeg[]): SymbolAggregate {
  const currencies = Array.from(new Set(legs.map((l) => l.currency)));
  const qtyByCcy = new Map<string, number>();
  for (const l of legs) {
    qtyByCcy.set(l.currency, (qtyByCcy.get(l.currency) ?? 0) + l.quantity);
  }
  const primary_currency =
    [...qtyByCcy.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";
  const primaryLegs = legs.filter((l) => l.currency === primary_currency);
  const totalQty = legs.reduce((s, l) => s + l.quantity, 0);
  const weightedCost =
    primaryLegs.length > 0
      ? primaryLegs.reduce((s, l) => s + l.avg_cost * l.quantity, 0) /
        primaryLegs.reduce((s, l) => s + l.quantity, 0)
      : 0;
  const currentPrice = primaryLegs[0]?.current_price ?? null;

  const baseTotal = legs.reduce((s, l) => s + l.market_value_base, 0);
  const baseCost = legs.reduce((s, l) => s + l.cost_basis_base, 0);
  const basePnl = baseTotal - baseCost;

  const allSameCcy = currencies.length === 1;
  const nativeValue = allSameCcy ? legs.reduce((s, l) => s + l.market_value, 0) : null;
  const nativeCost = allSameCcy ? legs.reduce((s, l) => s + l.cost_basis, 0) : null;
  const nativePnl =
    nativeValue != null && nativeCost != null ? nativeValue - nativeCost : null;

  const accountCount = new Set(legs.map((l) => l.account_id)).size;

  const asset_class = classifyPosition({
    symbol,
    currency: primary_currency,
  });

  return {
    symbol,
    name: null, // filled in by caller from position.name
    currencies,
    primary_currency,
    asset_class,
    total_quantity: totalQty,
    avg_cost: weightedCost,
    current_price: currentPrice,
    market_value_native: nativeValue,
    cost_basis_native: nativeCost,
    pnl_native: nativePnl,
    market_value_base: baseTotal,
    cost_basis_base: baseCost,
    pnl_base: basePnl,
    pnl_pct_base: baseCost !== 0 ? basePnl / baseCost : 0,
    portfolio_weight: 0, // filled by caller knowing total net worth
    account_count: accountCount,
  };
}

/**
 * Aggregate all open positions by symbol. Cross-account positions of the same
 * symbol get merged (e.g. PDD held in both Schwab and Longbridge).
 */
export function listSymbols(db: AppDatabase): SymbolAggregate[] {
  const open = listPositions(db);
  const accs = listAccounts(db, { includeInactive: true });
  const accByName = new Map(accs.map((a) => [a.id, a.name]));
  const bySymbol = new Map<string, SymbolAccountLeg[]>();
  for (const p of open) {
    const accName = accByName.get(p.account_id) ?? p.account_id;
    const leg = buildLeg(db, p, accName);
    if (!bySymbol.has(p.symbol)) bySymbol.set(p.symbol, []);
    bySymbol.get(p.symbol)!.push(leg);
  }
  const nw = getNetWorth(db);
  const total = nw.total;
  const aggs: SymbolAggregate[] = [];
  for (const [symbol, legs] of bySymbol) {
    const agg = summarizeLegs(symbol, legs);
    agg.portfolio_weight = total > 0 ? agg.market_value_base / total : 0;
    const namedLeg = open.find(
      (p) => p.symbol === symbol && p.name && p.name.length > 0,
    );
    if (namedLeg) agg.name = namedLeg.name;
    aggs.push(agg);
  }
  aggs.sort((a, b) => b.market_value_base - a.market_value_base);
  return aggs;
}

/**
 * Rename every position holding `oldSymbol` to `newSymbol`. Cross-account.
 */
export function renameSymbol(
  db: AppDatabase,
  oldSymbol: string,
  newSymbol: string,
): number {
  const matched = db
    .select()
    .from(positions)
    .where(eq(positions.symbol, oldSymbol))
    .all();
  if (matched.length === 0) return 0;
  const ts = new Date().toISOString();
  db.update(positions)
    .set({ symbol: newSymbol, updated_at: ts })
    .where(eq(positions.symbol, oldSymbol))
    .run();
  return matched.length;
}

/** Set display name on every position holding `symbol`. */
export function setSymbolName(
  db: AppDatabase,
  symbol: string,
  name: string,
): number {
  const matched = db
    .select()
    .from(positions)
    .where(eq(positions.symbol, symbol))
    .all();
  if (matched.length === 0) return 0;
  const ts = new Date().toISOString();
  db.update(positions)
    .set({ name, updated_at: ts })
    .where(eq(positions.symbol, symbol))
    .run();
  return matched.length;
}

export function getSymbolDetail(db: AppDatabase, symbol: string): SymbolDetail | null {
  const matching = listPositions(db).filter((p) => p.symbol === symbol);
  if (matching.length === 0) return null;
  const accs = listAccounts(db, { includeInactive: true });
  const accByName = new Map(accs.map((a) => [a.id, a.name]));
  const legs = matching.map((p) =>
    buildLeg(db, p, accByName.get(p.account_id) ?? p.account_id),
  );
  const agg = summarizeLegs(symbol, legs);
  const nw = getNetWorth(db);
  agg.portfolio_weight = nw.total > 0 ? agg.market_value_base / nw.total : 0;
  const namedLeg = matching.find((p) => p.name && p.name.length > 0);
  if (namedLeg) agg.name = namedLeg.name;
  return {
    ...agg,
    legs: legs.sort((a, b) => b.market_value_base - a.market_value_base),
  };
}
