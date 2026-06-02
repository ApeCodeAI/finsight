import { readFileSync } from "node:fs";
import { ulid } from "ulid";
import { accounts } from "../db/schema.js";
import type { AppDatabase } from "../db/connection.js";
import {
  listAccounts,
  createAccount,
  updateBalance,
  editAccount,
} from "./account.js";
import { createPosition } from "./position.js";
import { takeSnapshot } from "./snapshot.js";
import { resolveTicker, resolveFundName } from "../data/ticker-map.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsedLiquidAccount {
  name: string;
  institution: string;
  type: string;
  currency: string;
  total_value: number; // 来自第 3 节"当前估值"
  notes: string;
}

export interface ParsedLiquidPosition {
  account_name: string;
  symbol: string;
  name: string | null;
  quantity: number;
  avg_cost: number;
  current_price: number;
  currency: string;
  notes: string | null;
}

export interface LiquidAssetsImportPlan {
  accounts: ParsedLiquidAccount[];
  positions: ParsedLiquidPosition[];
  // 各账户的计算后现金 balance（= total_value - 持仓 CNY 估值）
  account_cash_estimates: Record<string, number>;
  // 转换到 CNY 用的汇率
  fx_rates: Record<string, number>;
  // 总 CNY 净值
  total_base: number;
  to_create_accounts: ParsedLiquidAccount[];
  to_skip_accounts: Array<{ name: string; reason: string }>;
}

export interface LiquidAssetsImportResult {
  created_accounts: number;
  skipped_accounts: number;
  created_positions: number;
  updated_balances: number;
  total_base: number;
  snapshot_id: string;
  snapshot_total: number;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Markdown table parser
// ─────────────────────────────────────────────────────────────────────────────

interface MdTable {
  precedingH2: string | null;
  precedingH3: string | null;
  headers: string[];
  rows: string[][];
}

function parseTableRow(line: string): string[] {
  return line
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());
}

function isSeparatorRow(line: string): boolean {
  return /^\|[\s-:|]+\|$/.test(line.trim());
}

function parseAllTables(md: string): MdTable[] {
  const lines = md.split(/\r?\n/);
  const tables: MdTable[] = [];
  let h2: string | null = null;
  let h3: string | null = null;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const h2Match = line.match(/^##\s+(.+)$/);
    const h3Match = line.match(/^###\s+(.+)$/);
    if (h2Match) {
      h2 = h2Match[1].trim();
      h3 = null;
      i++;
      continue;
    }
    if (h3Match) {
      h3 = h3Match[1].trim();
      i++;
      continue;
    }
    // table starts with a "| ... |" header followed by a separator row
    if (line.trim().startsWith("|") && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      const headers = parseTableRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|") && !isSeparatorRow(lines[i])) {
        rows.push(parseTableRow(lines[i]));
        i++;
      }
      tables.push({ precedingH2: h2, precedingH3: h3, headers, rows });
      continue;
    }
    i++;
  }
  return tables;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Column-name based field resolver
// ─────────────────────────────────────────────────────────────────────────────

function colIndex(headers: string[], ...candidates: string[]): number {
  for (const c of candidates) {
    const idx = headers.findIndex((h) => h === c);
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseNumber(raw: string | undefined): number {
  if (!raw) return Number.NaN;
  // strip currency suffix tokens like "USD" / "HKD" / "CNY"
  const cleaned = raw.replace(/[,\s]/g, "").replace(/(USD|HKD|CNY|元|港币|美元)$/i, "");
  return Number(cleaned);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Account mapping: which H3 sections feed which liquid-asset account?
//  These keys must match the "资产名称" column in Section 3.
// ─────────────────────────────────────────────────────────────────────────────

const H3_TO_ACCOUNT: Array<{ match: (h3: string) => boolean; account: string }> = [
  { match: (h3) => /^4\.2/.test(h3), account: "富途长钱账户" },
  { match: (h3) => /^5\.2/.test(h3), account: "长桥股票" },
  { match: (h3) => /^5\.3/.test(h3), account: "长桥股票" },
  { match: (h3) => /^8\.2/.test(h3), account: "支付宝基金" },
  { match: (h3) => /^9\.2/.test(h3), account: "雪球长钱账户" },
  { match: (h3) => /^9\.3/.test(h3), account: "雪球长钱账户" },
];

function holdingAccountForH3(h3: string | null): string | null {
  if (!h3) return null;
  for (const m of H3_TO_ACCOUNT) {
    if (m.match(h3)) return m.account;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Conservative built-in FX. Values are approximate, derived from the vault MD.
// ─────────────────────────────────────────────────────────────────────────────

const FX_TO_CNY: Record<string, number> = {
  CNY: 1,
  USD: 6.8765, // 274,766.19 / 39,958（MD §4.3 列了错算 6.8823，实际是 6.8765）
  HKD: 0.8543, // MD §5.4 反推（长桥 335,111.81 CNY 持仓闭合算出）
};

function toCNY(amount: number, currency: string): number {
  const rate = FX_TO_CNY[currency] ?? 1;
  return amount * rate;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Parsers per table-kind
// ─────────────────────────────────────────────────────────────────────────────

function parseSection3Accounts(t: MdTable): ParsedLiquidAccount[] {
  const idxName = colIndex(t.headers, "资产名称");
  const idxInst = colIndex(t.headers, "机构 / 账户", "机构");
  const idxType = colIndex(t.headers, "资产类型");
  const idxCurr = colIndex(t.headers, "币种");
  const idxValue = colIndex(t.headers, "当前估值");
  const idxNotes = colIndex(t.headers, "备注");
  const out: ParsedLiquidAccount[] = [];
  for (const r of t.rows) {
    if (idxName < 0 || idxValue < 0) continue;
    const value = parseNumber(r[idxValue]);
    if (Number.isNaN(value)) continue;
    out.push({
      name: r[idxName],
      institution: idxInst >= 0 ? r[idxInst] : "",
      type: idxType >= 0 ? r[idxType] : "other",
      currency: idxCurr >= 0 ? r[idxCurr] : "CNY",
      total_value: value,
      notes: idxNotes >= 0 ? r[idxNotes] : "",
    });
  }
  return out;
}

/** Stock-style holding table: | 标的 | 股数 | 成本价 | 现价 | 币种 | 推算市值 | 备注 | */
function parseStockHoldings(
  t: MdTable,
  accountName: string,
): ParsedLiquidPosition[] {
  const idxSym = colIndex(t.headers, "标的");
  const idxQty = colIndex(t.headers, "股数");
  const idxCost = colIndex(t.headers, "成本价");
  const idxPrice = colIndex(t.headers, "现价");
  const idxCurr = colIndex(t.headers, "币种");
  const idxNotes = colIndex(t.headers, "备注");
  if (idxSym < 0 || idxQty < 0 || idxCost < 0 || idxPrice < 0) return [];
  const out: ParsedLiquidPosition[] = [];
  for (const r of t.rows) {
    const rawSymbol = r[idxSym];
    const qty = parseNumber(r[idxQty]);
    const cost = parseNumber(r[idxCost]);
    const price = parseNumber(r[idxPrice]);
    const currency = idxCurr >= 0 ? r[idxCurr] : "CNY";
    if (!rawSymbol || Number.isNaN(qty) || Number.isNaN(cost) || Number.isNaN(price)) {
      continue;
    }
    // Translate raw vault symbol (e.g. "拼多多") to canonical ticker (e.g. "PDD")
    const mapped = resolveTicker(rawSymbol);
    const symbol = mapped?.ticker ?? rawSymbol;
    const name = mapped?.name ?? rawSymbol;
    out.push({
      account_name: accountName,
      symbol,
      name,
      quantity: qty,
      avg_cost: cost,
      current_price: price,
      currency,
      notes: idxNotes >= 0 ? r[idxNotes] || null : null,
    });
  }
  return out;
}

/** Fund-style holding table — two flavors:
 *    8.2 (支付宝): | 标的 | 代码 | 持有金额 | 持仓成本 | 持有份额 | 净值 |
 *    9.x (雪球):   | 标的 | 代码 | 持有金额 | 持有份额 | 持有单价 | 最新净值 |
 *  We extract by column NAME, not position. */
function parseFundHoldings(
  t: MdTable,
  accountName: string,
): ParsedLiquidPosition[] {
  const idxName = colIndex(t.headers, "标的");
  const idxCode = colIndex(t.headers, "代码");
  const idxQty = colIndex(t.headers, "持有份额");
  const idxCost = colIndex(t.headers, "持仓成本", "持有单价");
  const idxPrice = colIndex(t.headers, "净值", "最新净值");
  const idxNotes = colIndex(t.headers, "备注");
  if (idxName < 0 || idxCode < 0 || idxQty < 0 || idxCost < 0 || idxPrice < 0) {
    return [];
  }
  const out: ParsedLiquidPosition[] = [];
  for (const r of t.rows) {
    const sym = r[idxCode];
    const fundName = r[idxName];
    const qty = parseNumber(r[idxQty]);
    const cost = parseNumber(r[idxCost]);
    const price = parseNumber(r[idxPrice]);
    if (!sym || Number.isNaN(qty) || Number.isNaN(cost) || Number.isNaN(price)) {
      continue;
    }
    // Fund code is already canonical; just enrich name from internal map when available
    const canonicalName = resolveFundName(sym) ?? fundName ?? sym;
    out.push({
      account_name: accountName,
      symbol: sym,
      name: canonicalName || null,
      quantity: qty,
      avg_cost: cost,
      current_price: price,
      currency: "CNY",
      notes: idxNotes >= 0 ? r[idxNotes] || null : null,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Public: plan / apply
// ─────────────────────────────────────────────────────────────────────────────

function buildParseResult(md: string): {
  accounts: ParsedLiquidAccount[];
  positions: ParsedLiquidPosition[];
} {
  const tables = parseAllTables(md);
  let accountsParsed: ParsedLiquidAccount[] = [];
  const positionsParsed: ParsedLiquidPosition[] = [];

  for (const t of tables) {
    // Section 3 accounts table is unique: headers contain "资产名称"
    if (t.headers.includes("资产名称")) {
      accountsParsed = parseSection3Accounts(t);
      continue;
    }
    const account = holdingAccountForH3(t.precedingH3);
    if (!account) continue;
    if (t.headers.includes("股数")) {
      positionsParsed.push(...parseStockHoldings(t, account));
    } else if (t.headers.includes("持有份额")) {
      positionsParsed.push(...parseFundHoldings(t, account));
    }
  }
  return { accounts: accountsParsed, positions: positionsParsed };
}

export function planLiquidAssetsImport(
  db: AppDatabase,
  mdPath: string,
): LiquidAssetsImportPlan {
  const md = readFileSync(mdPath, "utf8");
  const { accounts: parsedAccounts, positions: parsedPositions } =
    buildParseResult(md);

  const existing = listAccounts(db, { includeInactive: true });
  const existingNames = new Set(existing.map((a) => a.name));
  const toCreate: ParsedLiquidAccount[] = [];
  const toSkip: Array<{ name: string; reason: string }> = [];
  for (const p of parsedAccounts) {
    if (existingNames.has(p.name)) {
      toSkip.push({ name: p.name, reason: "already exists" });
    } else {
      toCreate.push(p);
    }
  }

  // For each account, compute cash balance = total_value (in CNY) - sum(positions in CNY)
  const totalsByAccount = new Map<string, number>();
  for (const a of parsedAccounts) {
    totalsByAccount.set(a.name, toCNY(a.total_value, a.currency));
  }
  const positionsBaseByAccount = new Map<string, number>();
  for (const p of parsedPositions) {
    const cnyValue = toCNY(p.quantity * p.current_price, p.currency);
    positionsBaseByAccount.set(
      p.account_name,
      (positionsBaseByAccount.get(p.account_name) ?? 0) + cnyValue,
    );
  }
  const account_cash_estimates: Record<string, number> = {};
  for (const a of parsedAccounts) {
    const accTotalBase = totalsByAccount.get(a.name) ?? 0;
    const posBase = positionsBaseByAccount.get(a.name) ?? 0;
    // 在原币种下记录 cash（用 reverse FX 折回账户 currency）
    const cashBase = accTotalBase - posBase;
    const cash = cashBase / (FX_TO_CNY[a.currency] ?? 1);
    account_cash_estimates[a.name] = Math.max(0, Math.round(cash * 100) / 100);
  }

  const totalCNY = parsedAccounts.reduce(
    (s, a) => s + toCNY(a.total_value, a.currency),
    0,
  );

  return {
    accounts: parsedAccounts,
    positions: parsedPositions,
    account_cash_estimates,
    fx_rates: { ...FX_TO_CNY },
    total_base: Math.round(totalCNY * 100) / 100,
    to_create_accounts: toCreate,
    to_skip_accounts: toSkip,
  };
}

export function applyLiquidAssetsImport(
  db: AppDatabase,
  mdPath: string,
  opts: { snapshotNote?: string; tag?: string } = {},
): LiquidAssetsImportResult {
  const plan = planLiquidAssetsImport(db, mdPath);
  const tag = opts.tag ?? "liquid-assets-2026-05-28";

  // 1. Create / locate accounts
  const allAccounts = listAccounts(db, { includeInactive: true });
  const byName = new Map(allAccounts.map((a) => [a.name, a]));
  let createdAccounts = 0;
  let updatedBalances = 0;

  for (const p of plan.accounts) {
    let acc = byName.get(p.name);
    if (!acc) {
      acc = createAccount(db, {
        name: p.name,
        type: p.type as never,
        currency: p.currency as never,
        institution: p.institution || undefined,
        tags: ["liquid-assets", tag],
        balance: plan.account_cash_estimates[p.name] ?? p.total_value,
        notes: p.notes || undefined,
      }) as never;
      createdAccounts++;
      byName.set(p.name, acc!);
    } else {
      // 已存在的账户：用 plan 算出的 cash 更新 balance（保留它的 ID）
      updateBalance(db, acc.id, plan.account_cash_estimates[p.name] ?? p.total_value);
      // 同步 notes 和 institution（不破坏 tags）
      editAccount(db, acc.id, {
        institution: p.institution || undefined,
        notes: p.notes || undefined,
      });
      updatedBalances++;
    }
  }

  // 2. Create positions
  let createdPositions = 0;
  for (const pos of plan.positions) {
    const acc = byName.get(pos.account_name);
    if (!acc) continue; // unknown account; skip silently
    createPosition(db, {
      account_id: acc.id,
      symbol: pos.symbol,
      name: pos.name ?? undefined,
      quantity: pos.quantity,
      avg_cost: pos.avg_cost,
      current_price: pos.current_price,
      currency: pos.currency as never,
      tags: ["liquid-assets", tag],
      notes: pos.notes ?? undefined,
    });
    createdPositions++;
  }

  // 3. Snapshot
  const snap = takeSnapshot(db, opts.snapshotNote ?? `import-md: ${tag}`);

  return {
    created_accounts: createdAccounts,
    skipped_accounts: plan.to_skip_accounts.length,
    created_positions: createdPositions,
    updated_balances: updatedBalances,
    total_base: plan.total_base,
    snapshot_id: snap.id,
    snapshot_total: snap.total_net_worth,
  };
}

// 保留旧导出名向后兼容（避免破坏 cli）
// 兼容 V1 字段：toCreate / toSkip / totalCNY
export interface LiquidAssetsImportPlanLegacy {
  parsed: ParsedLiquidAccount[];
  toCreate: ParsedLiquidAccount[];
  toSkip: Array<{ name: string; reason: string }>;
  totalCNY: number;
}
