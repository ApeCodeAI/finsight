import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "../db/connection.js";
import { exchange_rates } from "../db/schema.js";
import type { AppDatabase } from "../db/connection.js";
import { createAccount, updateBalance } from "../services/account.js";
import { createPosition } from "../services/position.js";
import {
  getNetWorth,
  getAllocation,
  getPositionPnL,
  getOverview,
  getAccountValuation,
  upsertFxRate,
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

  it("should use the latest dated FX rate when several rows exist", () => {
    db.insert(exchange_rates)
      .values([
        {
          id: "usd-cny-old",
          from_currency: "USD",
          to_currency: "CNY",
          rate: 6,
          rate_date: "2026-05-29",
          created_at: "2026-05-29T00:00:00.000Z",
        },
        {
          id: "usd-cny-new",
          from_currency: "USD",
          to_currency: "CNY",
          rate: 7,
          rate_date: "2026-07-14",
          created_at: "2026-07-14T00:00:00.000Z",
        },
      ])
      .run();
    const usd = createAccount(db, {
      name: "USD Broker",
      type: "brokerage",
      currency: "USD",
    });
    updateBalance(db, usd.id, 100);

    const nw = getNetWorth(db);
    expect(nw.total).toBe(700);
    expect(nw.byAccount[0].balance_base).toBe(700);
  });

  it("should preserve FX history while updating today's rate", () => {
    db.insert(exchange_rates)
      .values({
        id: "usd-cny-history",
        from_currency: "USD",
        to_currency: "CNY",
        rate: 6,
        rate_date: "2000-01-01",
        created_at: "2000-01-01T00:00:00.000Z",
      })
      .run();

    const first = upsertFxRate(db, "USD", "CNY", 7);
    const second = upsertFxRate(db, "USD", "CNY", 8);
    const rows = db.select().from(exchange_rates).all();

    expect(first.previous).toBe(6);
    expect(second.previous).toBe(7);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.rate)).toContain(6);
    expect(rows.map((row) => row.rate)).toContain(8);
  });

  it("should value mixed-currency account cash and positions in a target currency", () => {
    db.insert(exchange_rates)
      .values([
        {
          id: "usd-cny-mixed",
          from_currency: "USD",
          to_currency: "CNY",
          rate: 7,
          rate_date: "2026-07-14",
          created_at: "2026-07-14T00:00:00.000Z",
        },
        {
          id: "hkd-cny-mixed",
          from_currency: "HKD",
          to_currency: "CNY",
          rate: 0.9,
          rate_date: "2026-07-14",
          created_at: "2026-07-14T00:00:00.000Z",
        },
      ])
      .run();
    const broker = createAccount(db, {
      name: "Mixed Broker",
      type: "brokerage",
      currency: "CNY",
    });
    updateBalance(db, broker.id, 100);
    createPosition(db, {
      account_id: broker.id,
      symbol: "US-ASSET",
      quantity: 10,
      avg_cost: 20,
      current_price: 20,
      currency: "USD",
    });
    createPosition(db, {
      account_id: broker.id,
      symbol: "HK-ASSET",
      quantity: 100,
      avg_cost: 10,
      current_price: 10,
      currency: "HKD",
    });

    expect(getAccountValuation(db, broker.id, "CNY")).toEqual({
      amount: 2400,
      currency: "CNY",
    });
  });

  it("should derive a cross-currency valuation through the configured base", () => {
    db.insert(exchange_rates)
      .values([
        {
          id: "usd-cny-cross",
          from_currency: "USD",
          to_currency: "CNY",
          rate: 7,
          rate_date: "2026-07-14",
          created_at: "2026-07-14T00:00:00.000Z",
        },
        {
          id: "eur-cny-cross",
          from_currency: "EUR",
          to_currency: "CNY",
          rate: 8.4,
          rate_date: "2026-07-14",
          created_at: "2026-07-14T00:00:00.000Z",
        },
      ])
      .run();
    const broker = createAccount(db, {
      name: "USD Broker With EUR Asset",
      type: "brokerage",
      currency: "USD",
    });
    createPosition(db, {
      account_id: broker.id,
      symbol: "EUR-ASSET",
      quantity: 100,
      avg_cost: 1,
      current_price: 1,
      currency: "EUR",
    });

    expect(getAccountValuation(db, broker.id, "USD")).toEqual({
      amount: 120,
      currency: "USD",
    });
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
