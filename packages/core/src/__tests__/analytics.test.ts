import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "../db/connection.js";
import type { AppDatabase } from "../db/connection.js";
import { createAccount, updateBalance } from "../services/account.js";
import { createPosition } from "../services/position.js";
import {
  getNetWorth,
  getAllocation,
  getPositionPnL,
  getOverview,
} from "../services/analytics.js";

describe("analytics service", () => {
  let db: AppDatabase;

  beforeEach(() => {
    db = getTestDb();
  });

  it("should calculate total net worth across all accounts", () => {
    const cash = createAccount(db, { name: "Bank", type: "cash" });
    updateBalance(db, cash.id, 50000);

    const broker = createAccount(db, { name: "Broker", type: "brokerage" });
    createPosition(db, {
      account_id: broker.id,
      symbol: "AAPL",
      quantity: 10,
      avg_cost: 170,
      current_price: 200,
    });

    const nw = getNetWorth(db);
    expect(nw.total).toBe(52000); // 50000 + 2000
    expect(nw.currency).toBe("CNY");
    expect(nw.byAccount).toHaveLength(2);
  });

  it("should calculate allocation by account type", () => {
    const cash = createAccount(db, { name: "Bank", type: "cash" });
    updateBalance(db, cash.id, 50000);

    const broker = createAccount(db, { name: "Broker", type: "brokerage" });
    updateBalance(db, broker.id, 50000);

    const alloc = getAllocation(db);
    expect(alloc.cash).toBeCloseTo(0.5);
    expect(alloc.brokerage).toBeCloseTo(0.5);
  });

  it("should return empty allocation when no accounts", () => {
    const alloc = getAllocation(db);
    expect(Object.keys(alloc)).toHaveLength(0);
  });

  it("should calculate position P&L", () => {
    const broker = createAccount(db, { name: "Broker", type: "brokerage" });
    const pos = createPosition(db, {
      account_id: broker.id,
      symbol: "AAPL",
      quantity: 10,
      avg_cost: 170,
      current_price: 200,
    });

    const pnl = getPositionPnL(db, pos.id);
    expect(pnl).not.toBeNull();
    expect(pnl!.cost).toBe(1700);
    expect(pnl!.value).toBe(2000);
    expect(pnl!.pnl).toBe(300);
    expect(pnl!.pnlPercent).toBeCloseTo(300 / 1700);
  });

  it("should return null for non-existent position", () => {
    const pnl = getPositionPnL(db, "nonexistent");
    expect(pnl).toBeNull();
  });

  it("should generate overview JSON", () => {
    const cash = createAccount(db, { name: "Bank", type: "cash" });
    updateBalance(db, cash.id, 100000);

    const overview = getOverview(db);
    expect(overview.total_net_worth).toBe(100000);
    expect(overview.currency).toBe("CNY");
    expect(overview.accounts).toHaveLength(1);
    expect(overview.snapshot_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
