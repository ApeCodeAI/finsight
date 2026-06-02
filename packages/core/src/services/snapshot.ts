import { eq, desc } from "drizzle-orm";
import { ulid } from "ulid";
import { snapshots } from "../db/schema.js";
import type { AppDatabase } from "../db/connection.js";
import type { SnapshotDiff } from "../types.js";
import { getBaseCurrency } from "../config/index.js";
import { listAccounts } from "./account.js";
import { listPositions } from "./position.js";
import { getFxRate } from "./analytics.js";

function now() {
  return new Date().toISOString();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function takeSnapshot(db: AppDatabase, note?: string) {
  const id = ulid();
  const ts = now();
  const snapshotDate = today();
  const base = getBaseCurrency();

  const accs = listAccounts(db);
  let totalNetWorth = 0;

  const data = accs.map((acc) => {
    const accPositions = listPositions(db, acc.id);
    const positionsData = accPositions.map((p) => {
      const fx = getFxRate(db, p.currency, base);
      const native = p.current_price * p.quantity;
      return {
        symbol: p.symbol,
        name: p.name,
        quantity: p.quantity,
        currency: p.currency,
        value: native,
        value_base: native * fx,
      };
    });

    const positionsValueBase = positionsData.reduce((s, p) => s + p.value_base, 0);
    const accountFx = getFxRate(db, acc.currency, base);
    const balanceBase = acc.balance * accountFx + positionsValueBase;
    totalNetWorth += balanceBase;

    return {
      account_id: acc.id,
      account_name: acc.name,
      currency: acc.currency,
      cash_balance: acc.balance,
      balance_base: balanceBase,
      positions: positionsData,
    };
  });

  const row = {
    id,
    snapshot_date: snapshotDate,
    total_net_worth: totalNetWorth,
    data: JSON.stringify({ base_currency: base, accounts: data }),
    notes: note ?? null,
    created_at: ts,
  };

  db.insert(snapshots).values(row).run();
  return row;
}

export function listSnapshots(db: AppDatabase) {
  return db.select().from(snapshots).orderBy(desc(snapshots.snapshot_date)).all();
}

export function getSnapshot(db: AppDatabase, id: string) {
  return db.select().from(snapshots).where(eq(snapshots.id, id)).get() ?? null;
}

interface SnapshotAccountRow {
  account_id: string;
  account_name: string;
  balance_base: number;
}

function parseSnapshotAccounts(raw: string | null): SnapshotAccountRow[] {
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (parsed && Array.isArray(parsed.accounts)) {
    return parsed.accounts as SnapshotAccountRow[];
  }
  return [];
}

export function diffSnapshots(db: AppDatabase, id1: string, id2: string): SnapshotDiff {
  const s1 = getSnapshot(db, id1);
  const s2 = getSnapshot(db, id2);
  if (!s1 || !s2) throw new Error("Snapshot not found");

  const data1 = parseSnapshotAccounts(s1.data);
  const data2 = parseSnapshotAccounts(s2.data);

  const map1 = new Map(data1.map((d) => [d.account_id, d]));
  const map2 = new Map(data2.map((d) => [d.account_id, d]));

  const allIds = new Set([...map1.keys(), ...map2.keys()]);
  const byAccount = Array.from(allIds).map((id) => {
    const a1 = map1.get(id);
    const a2 = map2.get(id);
    return {
      account_id: id,
      account_name: (a2 ?? a1)!.account_name,
      balance1: a1?.balance_base ?? 0,
      balance2: a2?.balance_base ?? 0,
      change: (a2?.balance_base ?? 0) - (a1?.balance_base ?? 0),
    };
  });

  const totalChange = s2.total_net_worth - s1.total_net_worth;
  const totalChangePercent = s1.total_net_worth !== 0 ? totalChange / s1.total_net_worth : 0;

  return {
    date1: s1.snapshot_date,
    date2: s2.snapshot_date,
    totalChange,
    totalChangePercent,
    byAccount,
  };
}
