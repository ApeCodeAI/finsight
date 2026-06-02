import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "../db/connection.js";
import type { AppDatabase } from "../db/connection.js";
import { createAccount } from "../services/account.js";
import {
  createPosition,
  listPositions,
  getPosition,
  updatePrice,
  closePosition,
} from "../services/position.js";

describe("position service", () => {
  let db: AppDatabase;
  let accountId: string;

  beforeEach(() => {
    db = getTestDb();
    const acc = createAccount(db, { name: "Broker", type: "brokerage" });
    accountId = acc.id;
  });

  it("should create a position with ULID", () => {
    const pos = createPosition(db, {
      account_id: accountId,
      symbol: "00700.HK",
      name: "Tencent",
      quantity: 100,
      avg_cost: 380,
      current_price: 400,
      currency: "HKD",
    });
    expect(pos.id).toHaveLength(26);
    expect(pos.symbol).toBe("00700.HK");
    expect(pos.quantity).toBe(100);
    expect(pos.avg_cost).toBe(380);
  });

  it("should list positions by account", () => {
    createPosition(db, {
      account_id: accountId,
      symbol: "00700.HK",
      quantity: 100,
      avg_cost: 380,
    });
    createPosition(db, {
      account_id: accountId,
      symbol: "AAPL",
      quantity: 50,
      avg_cost: 170,
    });
    const list = listPositions(db, accountId);
    expect(list).toHaveLength(2);
  });

  it("should list all open positions", () => {
    createPosition(db, {
      account_id: accountId,
      symbol: "00700.HK",
      quantity: 100,
      avg_cost: 380,
    });
    const list = listPositions(db);
    expect(list).toHaveLength(1);
  });

  it("should update current price", () => {
    const pos = createPosition(db, {
      account_id: accountId,
      symbol: "AAPL",
      quantity: 50,
      avg_cost: 170,
    });
    const updated = updatePrice(db, pos.id, 200);
    expect(updated!.current_price).toBe(200);
  });

  it("should close position", () => {
    const pos = createPosition(db, {
      account_id: accountId,
      symbol: "AAPL",
      quantity: 50,
      avg_cost: 170,
    });
    const closed = closePosition(db, pos.id);
    expect(closed!.closed_at).not.toBeNull();
    // Closed positions don't appear in default list
    const list = listPositions(db);
    expect(list).toHaveLength(0);
  });

  it("should calculate P&L from position data", () => {
    const pos = createPosition(db, {
      account_id: accountId,
      symbol: "AAPL",
      quantity: 50,
      avg_cost: 170,
      current_price: 200,
    });
    const pnl = (pos.current_price - pos.avg_cost) * pos.quantity;
    expect(pnl).toBe(1500);
  });
});
