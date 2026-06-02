import type { AppDatabase } from "../db/connection.js";
import { getBaseCurrency } from "../config/index.js";
import { listAccounts } from "./account.js";
import { listPositions } from "./position.js";
import { getNetWorth, toBase } from "./analytics.js";
import { tForLabels } from "../i18n/index.js";

/**
 * Coarse asset class used for the "where is my money" view.
 *
 * Heuristic rules — designed for the data shapes commonly seen in the
 * fixtures, and easily overridable by tagging a position with `class:<name>`.
 */
export type AssetClass =
  | "us-stock"
  | "hk-stock"
  | "a-stock"
  | "fund"
  | "cash"
  | "crypto"
  | "other";

/** Stable i18n key names. Use {@link assetClassLabel} for display strings. */
export const ASSET_CLASSES: readonly AssetClass[] = [
  "us-stock",
  "hk-stock",
  "a-stock",
  "fund",
  "crypto",
  "cash",
  "other",
];

/** Localized label for an asset class. Default language comes from config. */
export function assetClassLabel(cls: AssetClass, language?: string): string {
  return tForLabels(language).asset_class[cls] ?? cls;
}

/**
 * Classify a single position-like row. Reads optional `tags` (already parsed
 * to string[] or as JSON string), so callers can override the heuristic by
 * tagging a position with e.g. `class:a-stock`.
 */
export function classifyPosition(input: {
  symbol: string;
  currency: string;
  tags?: string[] | string | null;
}): AssetClass {
  const tags =
    typeof input.tags === "string" ? safeParseTags(input.tags) : (input.tags ?? []);
  const tagged = tags.find((t) => t.startsWith("class:"));
  if (tagged) {
    const cls = tagged.slice("class:".length) as AssetClass;
    if (ASSET_CLASSES.includes(cls)) return cls;
  }
  if (input.currency === "USD") return "us-stock";
  if (input.currency === "HKD") return "hk-stock";
  if (input.currency === "CNY") {
    if (/^\d{6}$/.test(input.symbol)) return "fund";
    return "a-stock";
  }
  if (input.currency === "USDT" || input.currency === "BTC" || input.currency === "ETH") {
    return "crypto";
  }
  return "other";
}

function safeParseTags(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/**
 * Classify an account's *cash* balance. Used so e.g. exchange cash is "crypto"
 * style classification rather than mixing with bank cash.
 */
export function classifyAccountCash(accountType: string): AssetClass {
  if (accountType === "crypto" || accountType === "exchange") return "crypto";
  return "cash";
}

// ─────────────────────────────────────────────────────────────────────────────
//  Net worth breakdown by asset class
// ─────────────────────────────────────────────────────────────────────────────

export interface AssetClassBucket {
  asset_class: AssetClass;
  label: string;
  value_base: number;
  cost_base: number; // 0 for cash/crypto cash buckets
  pnl_base: number; // 0 for cash buckets
  pnl_pct: number;
  weight: number; // 0..1 of total net worth
  position_count: number;
  symbol_count: number;
  accounts: string[]; // distinct account names holding this class
}

export interface NetWorthByAssetClass {
  total_base: number;
  base_currency: string;
  buckets: AssetClassBucket[];
}

export function getNetWorthByAssetClass(
  db: AppDatabase,
  language?: string,
): NetWorthByAssetClass {
  const base = getBaseCurrency();
  const positions = listPositions(db);
  const accs = listAccounts(db, { includeInactive: true });
  const accById = new Map(accs.map((a) => [a.id, a]));
  const nw = getNetWorth(db);

  const buckets = new Map<
    AssetClass,
    {
      value: number;
      cost: number;
      positions: number;
      symbols: Set<string>;
      accounts: Set<string>;
    }
  >();

  function add(cls: AssetClass) {
    let b = buckets.get(cls);
    if (!b) {
      b = {
        value: 0,
        cost: 0,
        positions: 0,
        symbols: new Set<string>(),
        accounts: new Set<string>(),
      };
      buckets.set(cls, b);
    }
    return b;
  }

  for (const p of positions) {
    const cls = classifyPosition({
      symbol: p.symbol,
      currency: p.currency,
      tags: p.tags,
    });
    const fx = p.currency === base ? 1 : toBase(db, 1, p.currency);
    const valueBase = p.current_price * p.quantity * fx;
    const costBase = p.avg_cost * p.quantity * fx;
    const b = add(cls);
    b.value += valueBase;
    b.cost += costBase;
    b.positions += 1;
    b.symbols.add(p.symbol);
    const acc = accById.get(p.account_id);
    if (acc) b.accounts.add(acc.name);
  }

  for (const a of accs) {
    if (!a.is_active) continue;
    const cashBase = toBase(db, a.balance, a.currency);
    if (cashBase === 0) continue;
    const cls = classifyAccountCash(a.type);
    const b = add(cls);
    b.value += cashBase;
    b.accounts.add(a.name);
  }

  const total = nw.total;
  const out: AssetClassBucket[] = [];
  for (const [cls, b] of buckets) {
    const pnl = b.value - b.cost;
    out.push({
      asset_class: cls,
      label: assetClassLabel(cls, language),
      value_base: b.value,
      cost_base: b.cost,
      pnl_base: pnl,
      pnl_pct: b.cost !== 0 ? pnl / b.cost : 0,
      weight: total > 0 ? b.value / total : 0,
      position_count: b.positions,
      symbol_count: b.symbols.size,
      accounts: Array.from(b.accounts).sort(),
    });
  }
  out.sort((a, b) => b.value_base - a.value_base);
  return {
    total_base: total,
    base_currency: base,
    buckets: out,
  };
}
