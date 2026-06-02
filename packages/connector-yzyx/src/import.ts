import { eq, and } from "drizzle-orm";
import { ulid } from "ulid";
import { accounts, snapshots, transactions } from "@finsight/core";
import type { AppDatabase } from "@finsight/core";
import type { ImportResult } from "@finsight/core";
import { readFileSync } from "node:fs";

// xlsx ESM/CJS interop helper
async function readXlsx(filePath: string): Promise<unknown[][]> {
  const mod = await import("xlsx");
  const lib = mod.default || mod;
  const buf = readFileSync(filePath);
  const wb = lib.read(buf);
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = lib.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
  return rows;
}

function now() {
  return new Date().toISOString();
}

/**
 * Convert Excel serial date number to YYYY-MM-DD string.
 */
function excelDateToISO(serial: number): string {
  // Excel epoch is 1899-12-30 (accounting for the 1900 leap year bug)
  const epoch = new Date(1899, 11, 30);
  const date = new Date(epoch.getTime() + serial * 86400000);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Map 有知有行 currency names to standard codes.
 */
function mapCurrency(cn: string): string {
  const map: Record<string, string> = {
    人民币: "CNY",
    美元: "USD",
    港币: "HKD",
    欧元: "EUR",
    日元: "JPY",
    英镑: "GBP",
  };
  return map[cn] ?? "CNY";
}

/**
 * Map 四笔钱 to tags.
 */
function mapTags(category: string): string[] {
  if (!category) return [];
  return [category];
}

export interface YzyxImportOptions {
  /** If provided, attach the import to this account (skip account creation). */
  accountId?: string;
  /** Do not overwrite account.balance with the latest snapshot total. */
  preserveBalance?: boolean;
  /** Notes prefix for created snapshots. Defaults to "yzyx:". */
  notesPrefix?: string;
}

/**
 * Import 有知有行 xlsx file into the database.
 * Creates an Account from row 1-2 metadata and Snapshots from row 5+ data.
 * Idempotent: skips snapshots that already exist for the same date.
 */
export async function importYouzhiyouhang(
  db: AppDatabase,
  filePath: string,
  opts: YzyxImportOptions = {},
): Promise<ImportResult> {
  const rows = await readXlsx(filePath);
  const notesPrefix = opts.notesPrefix ?? "yzyx:";

  // Row 1: headers (账户名称, 账户目标, 预期年化收益率, 预计投资时间, 币种, 四笔钱)
  // Row 2: values
  const metaValues = rows[1] as string[];
  const accountName = String(metaValues[0] || "Imported Account");
  const currency = mapCurrency(String(metaValues[4] || "人民币"));
  const tags = mapTags(String(metaValues[5] || ""));

  const ts = now();
  let accountId: string;
  let accountNameForNotes = accountName;

  if (opts.accountId) {
    // Caller pinned account: skip creation, ignore metadata mismatch.
    // For notes, prefer the pinned account's real name so historical snapshots
    // stay queryable by the canonical account name.
    accountId = opts.accountId;
    const pinned = db
      .select()
      .from(accounts)
      .where(eq(accounts.id, opts.accountId))
      .get();
    if (pinned) accountNameForNotes = pinned.name;
  } else {
    let account = db
      .select()
      .from(accounts)
      .where(eq(accounts.name, accountName))
      .get();
    if (!account) {
      accountId = ulid();
      db.insert(accounts)
        .values({
          id: accountId,
          name: accountName,
          type: "fund",
          currency,
          institution: "有知有行",
          tags: JSON.stringify(tags),
          balance: 0,
          notes: `Imported from 有知有行 xlsx`,
          is_active: 1,
          created_at: ts,
          updated_at: ts,
        })
        .run();
    } else {
      accountId = account.id;
    }
  }

  // Row 4 is header, Row 5+ is data
  // Columns: 记录类型(0), 记账时间(1), 转入转出金额(2), 总资产金额(3), 投资日志(4), 创建时间(5), 明细(6)
  // Two record types in the same sheet:
  //   `记总资产`   → period snapshot of account total → snapshots table
  //   `转入转出`   → external cash flow event         → transactions table
  let snapshotsCreated = 0;
  let snapshotsSkipped = 0;
  let transactionsCreated = 0;
  let transactionsSkipped = 0;
  let latestBalance = 0;
  const noteValue = `${notesPrefix}${accountNameForNotes}`;

  for (let i = 4; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue;

    const recordType = String(row[0]);
    const dateSerial = row[1] as number;
    if (!dateSerial || typeof dateSerial !== "number") continue;
    const txDate = excelDateToISO(dateSerial);
    const investLog = row[4] ? String(row[4]) : null;

    if (recordType === "记总资产") {
      const totalAsset = row[3] as number;
      const existing = db
        .select()
        .from(snapshots)
        .where(
          and(
            eq(snapshots.snapshot_date, txDate),
            eq(snapshots.notes, noteValue),
          ),
        )
        .get();
      if (existing) {
        snapshotsSkipped++;
        continue;
      }
      const data = JSON.stringify([
        {
          account_id: accountId,
          account_name: accountName,
          balance: totalAsset,
          currency,
          positions: [],
        },
      ]);
      db.insert(snapshots)
        .values({
          id: ulid(),
          snapshot_date: txDate,
          total_net_worth: totalAsset,
          data,
          notes: noteValue,
          created_at: ts,
        })
        .run();
      snapshotsCreated++;
      latestBalance = totalAsset;
    } else if (recordType === "转入转出") {
      const amount = row[2];
      if (typeof amount !== "number" || amount === 0) continue;
      // Dedup: same account + date + amount + type → skip on re-import.
      const type = amount > 0 ? "deposit" : "withdraw";
      const existing = db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.account_id, accountId),
            eq(transactions.traded_at, txDate),
            eq(transactions.amount, amount),
            eq(transactions.type, type),
          ),
        )
        .get();
      if (existing) {
        transactionsSkipped++;
        continue;
      }
      db.insert(transactions)
        .values({
          id: ulid(),
          account_id: accountId,
          position_id: null,
          type,
          amount,
          quantity: null,
          price: null,
          fee: 0,
          currency,
          counterpart_account_id: null,
          braindump_id: null,
          notes: investLog,
          traded_at: txDate,
          created_at: ts,
        })
        .run();
      transactionsCreated++;
    }
  }

  // Update account balance to latest snapshot value (unless caller forbids)
  if (latestBalance > 0 && !opts.preserveBalance) {
    db.update(accounts)
      .set({ balance: latestBalance, updated_at: ts })
      .where(eq(accounts.id, accountId))
      .run();
  }

  return {
    accountId,
    accountName,
    snapshotsCreated,
    snapshotsSkipped,
    transactionsCreated,
    transactionsSkipped,
  };
}
