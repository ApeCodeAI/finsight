/**
 * Performance / annualized-return calculations.
 *
 * Inputs:
 *  - transactions of type `deposit` / `withdraw` = external cash flows
 *  - the account's (or portfolio's) current value = terminal balance
 *
 * Two metrics:
 *  - **CAGR**: pure beginning-vs-ending compounded annual growth. Ignores
 *    deposits/withdrawals — useful when there are none (a buy-and-hold lump
 *    sum); misleading otherwise. Returned as a sanity check.
 *  - **XIRR**: money-weighted IRR over the cash-flow series + terminal value.
 *    This is the number 有知有行 / brokers typically show as "年化收益率".
 *
 * Sign convention for the cash-flow series fed to the solver:
 *   deposit  = -amount  (money OUT of your wallet, INTO the account)
 *   withdraw = +amount  (money INTO your wallet, OUT of the account)
 *   terminal = +current_value  (notional liquidation today)
 */
import type { AppDatabase } from "../db/connection.js";
import { transactions } from "../db/schema.js";
import { eq, and, or, inArray } from "drizzle-orm";
import { getBaseCurrency } from "../config/index.js";
import { listAccounts } from "./account.js";
import { listPositions } from "./position.js";
import { toBase } from "./analytics.js";

export type PerformanceCashflow = {
  date: string; // YYYY-MM-DD
  amount: number; // positive = inflow to user, negative = outflow from user
  kind: "deposit" | "withdraw" | "terminal";
};

export interface PerformanceResult {
  account_id: string | null; // null = overall portfolio
  account_name: string;
  currency: string; // native currency for per-account; base currency for overall
  period_start: string;
  period_end: string;
  days: number;
  net_deposits: number; // sum(deposits) - sum(withdrawals), absolute
  current_value: number;
  total_return: number; // current_value - net_deposits
  total_return_pct: number | null; // total_return / net_deposits (null when no deposits)
  cagr: number | null; // (end / start)^(365/days) - 1, null when no first snapshot or start <= 0
  xirr: number | null; // null when solver fails to converge
  cashflow_count: number;
}

/** Days between two YYYY-MM-DD strings. */
function daysBetween(a: string, b: string): number {
  const da = Date.parse(a);
  const db = Date.parse(b);
  if (Number.isNaN(da) || Number.isNaN(db)) return 0;
  return Math.max(1, Math.round((db - da) / 86400000));
}

function years(daysCount: number): number {
  return daysCount / 365;
}

/**
 * Compute XIRR for a list of (date, amount) cash flows using Newton-Raphson,
 * with bisection fallback when the derivative gets unstable. Returns null
 * if the series is degenerate (no sign change) or doesn't converge.
 *
 * Convention: amount sign as documented at the top of this file.
 */
export function xirr(
  flows: Array<{ date: string; amount: number }>,
  options?: { guess?: number; tolerance?: number; maxIterations?: number },
): number | null {
  if (flows.length < 2) return null;
  // Need at least one positive and one negative cash flow or there's no IRR.
  const hasPos = flows.some((f) => f.amount > 0);
  const hasNeg = flows.some((f) => f.amount < 0);
  if (!hasPos || !hasNeg) return null;

  const sorted = [...flows].sort((a, b) => a.date.localeCompare(b.date));
  const t0 = sorted[0]!.date;
  const ts = sorted.map((f) => daysBetween(t0, f.date) / 365);
  const amts = sorted.map((f) => f.amount);

  const tol = options?.tolerance ?? 1e-7;
  const maxIter = options?.maxIterations ?? 100;

  function npv(rate: number): number {
    let s = 0;
    for (let i = 0; i < amts.length; i++) {
      s += amts[i]! / Math.pow(1 + rate, ts[i]!);
    }
    return s;
  }
  function dnpv(rate: number): number {
    let s = 0;
    for (let i = 0; i < amts.length; i++) {
      s += (-ts[i]! * amts[i]!) / Math.pow(1 + rate, ts[i]! + 1);
    }
    return s;
  }

  let rate = options?.guess ?? 0.1;
  for (let i = 0; i < maxIter; i++) {
    const v = npv(rate);
    if (Math.abs(v) < tol) return rate;
    const dv = dnpv(rate);
    if (!Number.isFinite(dv) || dv === 0) break;
    const next = rate - v / dv;
    if (!Number.isFinite(next) || next <= -1) break;
    if (Math.abs(next - rate) < tol) return next;
    rate = next;
  }

  // Newton failed; try bisection in a wide range as fallback.
  let lo = -0.999;
  let hi = 10;
  let flo = npv(lo);
  let fhi = npv(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi)) return null;
  if (flo * fhi > 0) return null; // no root in range
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fmid = npv(mid);
    if (Math.abs(fmid) < tol) return mid;
    if (flo * fmid < 0) {
      hi = mid;
      fhi = fmid;
    } else {
      lo = mid;
      flo = fmid;
    }
  }
  return (lo + hi) / 2;
}

/**
 * Compute the current native-currency value of an account (cash + positions).
 * Mirrors the logic in analytics/account-detail to keep "current_value" of
 * performance metrics consistent with what the dashboard shows.
 */
function accountNativeValue(db: AppDatabase, accountId: string): number {
  const acc = listAccounts(db, { includeInactive: true }).find(
    (a) => a.id === accountId,
  );
  if (!acc) return 0;
  const positions = listPositions(db, accountId);
  const posValue = positions.reduce(
    (s, p) => s + p.current_price * p.quantity,
    0,
  );
  return acc.balance + posValue;
}

/**
 * Performance for a single account, expressed in that account's currency.
 */
export function getAccountPerformance(
  db: AppDatabase,
  accountId: string,
): PerformanceResult | null {
  const acc = listAccounts(db, { includeInactive: true }).find(
    (a) => a.id === accountId,
  );
  if (!acc) return null;

  const txns = db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.account_id, accountId),
        or(
          eq(transactions.type, "deposit"),
          eq(transactions.type, "withdraw"),
        ),
      ),
    )
    .all();

  const currentValue = accountNativeValue(db, accountId);
  const today = new Date().toISOString().slice(0, 10);

  if (txns.length === 0) {
    return {
      account_id: accountId,
      account_name: acc.name,
      currency: acc.currency,
      period_start: today,
      period_end: today,
      days: 0,
      net_deposits: 0,
      current_value: currentValue,
      total_return: 0,
      total_return_pct: null,
      cagr: null,
      xirr: null,
      cashflow_count: 0,
    };
  }

  const sorted = [...txns].sort((a, b) => a.traded_at.localeCompare(b.traded_at));
  const periodStart = sorted[0]!.traded_at.slice(0, 10);
  const days = daysBetween(periodStart, today);

  let deposits = 0;
  let withdrawals = 0;
  const flows: Array<{ date: string; amount: number }> = [];
  for (const t of sorted) {
    const d = t.traded_at.slice(0, 10);
    const a = t.amount;
    if (a > 0) {
      deposits += a;
      flows.push({ date: d, amount: -a });
    } else if (a < 0) {
      withdrawals += -a;
      flows.push({ date: d, amount: -a }); // -a is positive (you received it)
    }
  }
  if (currentValue > 0) {
    flows.push({ date: today, amount: currentValue });
  }

  const netDeposits = deposits - withdrawals;
  const totalReturn = currentValue - netDeposits;
  const totalReturnPct = netDeposits > 0 ? totalReturn / netDeposits : null;
  // CAGR not meaningful when initial balance is 0 (which is the typical case
  // for an account whose history is reconstructed from cash flows). We skip
  // it here and rely on XIRR.
  const cagr = null;

  return {
    account_id: accountId,
    account_name: acc.name,
    currency: acc.currency,
    period_start: periodStart,
    period_end: today,
    days,
    net_deposits: netDeposits,
    current_value: currentValue,
    total_return: totalReturn,
    total_return_pct: totalReturnPct,
    cagr,
    xirr: xirr(flows),
    cashflow_count: txns.length,
  };
}

/**
 * Portfolio-wide performance. Cash flows from all accounts are summed in the
 * base currency (using current FX rate as an approximation — historical FX
 * for each event isn't tracked yet, so this is a known precision limit).
 */
export function getPortfolioPerformance(db: AppDatabase): PerformanceResult {
  const base = getBaseCurrency();
  const accs = listAccounts(db, { includeInactive: true });
  const accIds = accs.map((a) => a.id);

  const txns = accIds.length === 0
    ? []
    : db
        .select()
        .from(transactions)
        .where(
          and(
            inArray(transactions.account_id, accIds),
            or(
              eq(transactions.type, "deposit"),
              eq(transactions.type, "withdraw"),
            ),
          ),
        )
        .all();

  let currentValueBase = 0;
  for (const a of accs) {
    const native = accountNativeValue(db, a.id);
    currentValueBase += toBase(db, native, a.currency);
  }

  const today = new Date().toISOString().slice(0, 10);
  if (txns.length === 0) {
    return {
      account_id: null,
      account_name: "Overall",
      currency: base,
      period_start: today,
      period_end: today,
      days: 0,
      net_deposits: 0,
      current_value: currentValueBase,
      total_return: 0,
      total_return_pct: null,
      cagr: null,
      xirr: null,
      cashflow_count: 0,
    };
  }

  const accCurrencyById = new Map(accs.map((a) => [a.id, a.currency]));
  const sorted = [...txns].sort((a, b) => a.traded_at.localeCompare(b.traded_at));
  const periodStart = sorted[0]!.traded_at.slice(0, 10);
  const days = daysBetween(periodStart, today);

  let depositsBase = 0;
  let withdrawalsBase = 0;
  const flows: Array<{ date: string; amount: number }> = [];
  for (const t of sorted) {
    const d = t.traded_at.slice(0, 10);
    const ccy = accCurrencyById.get(t.account_id) ?? t.currency ?? base;
    const baseAmount = toBase(db, t.amount, ccy);
    if (baseAmount > 0) {
      depositsBase += baseAmount;
      flows.push({ date: d, amount: -baseAmount });
    } else if (baseAmount < 0) {
      withdrawalsBase += -baseAmount;
      flows.push({ date: d, amount: -baseAmount });
    }
  }
  if (currentValueBase > 0) {
    flows.push({ date: today, amount: currentValueBase });
  }

  const netDeposits = depositsBase - withdrawalsBase;
  const totalReturn = currentValueBase - netDeposits;
  const totalReturnPct = netDeposits > 0 ? totalReturn / netDeposits : null;

  return {
    account_id: null,
    account_name: "Overall",
    currency: base,
    period_start: periodStart,
    period_end: today,
    days,
    net_deposits: netDeposits,
    current_value: currentValueBase,
    total_return: totalReturn,
    total_return_pct: totalReturnPct,
    cagr: null,
    xirr: xirr(flows),
    cashflow_count: txns.length,
  };
}

/**
 * Compute performance for every active account + the overall portfolio.
 * Returns a single object with both for one-shot consumption.
 */
export function getAllPerformance(db: AppDatabase): {
  accounts: PerformanceResult[];
  overall: PerformanceResult;
} {
  const accs = listAccounts(db, { includeInactive: true });
  const byAcc: PerformanceResult[] = [];
  for (const a of accs) {
    const r = getAccountPerformance(db, a.id);
    if (r) byAcc.push(r);
  }
  byAcc.sort((a, b) => b.current_value - a.current_value);
  return {
    accounts: byAcc,
    overall: getPortfolioPerformance(db),
  };
}
