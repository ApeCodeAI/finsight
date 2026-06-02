import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "../db/connection.js";
import type { AppDatabase } from "../db/connection.js";
import { createAccount, updateBalance } from "../services/account.js";
import { createPosition } from "../services/position.js";
import {
  takeSnapshot,
  listSnapshots,
  diffSnapshots,
} from "../services/snapshot.js";

describe("snapshot service", () => {
  let db: AppDatabase;

  beforeEach(() => {
    db = getTestDb();
  });

  it("should take snapshot capturing all accounts and positions", () => {
    const acc = createAccount(db, { name: "Bank", type: "cash" });
    updateBalance(db, acc.id, 50000);

    const broker = createAccount(db, { name: "Broker", type: "brokerage" });
    createPosition(db, {
      account_id: broker.id,
      symbol: "AAPL",
      quantity: 10,
      avg_cost: 170,
      current_price: 200,
    });

    const snap = takeSnapshot(db, "test snapshot");
    expect(snap.id).toHaveLength(26);
    expect(snap.total_net_worth).toBe(52000); // 50000 + 10*200
    expect(snap.notes).toBe("test snapshot");

    const parsed = JSON.parse(snap.data!);
    expect(parsed.accounts).toHaveLength(2);
    expect(parsed.accounts[0].account_name).toBe("Bank");
    expect(parsed.accounts[0].balance_base).toBe(50000);
  });

  it("should list snapshots sorted by date descending", () => {
    createAccount(db, { name: "A", type: "cash" });
    takeSnapshot(db, "first");
    takeSnapshot(db, "second");
    const list = listSnapshots(db);
    expect(list).toHaveLength(2);
  });

  it("should diff two snapshots", () => {
    const acc = createAccount(db, { name: "Bank", type: "cash" });
    updateBalance(db, acc.id, 50000);
    const s1 = takeSnapshot(db);

    updateBalance(db, acc.id, 60000);
    const s2 = takeSnapshot(db);

    const diff = diffSnapshots(db, s1.id, s2.id);
    expect(diff.totalChange).toBe(10000);
    expect(diff.byAccount).toHaveLength(1);
    expect(diff.byAccount[0].change).toBe(10000);
  });
});

