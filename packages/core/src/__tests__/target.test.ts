import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb, type AppDatabase } from "../db/connection.js";
import { createAccount, updateBalance } from "../services/account.js";
import { createPosition } from "../services/position.js";
import {
  createTarget,
  listTargets,
  getActiveTarget,
  setActiveTarget,
  checkTarget,
  deleteTarget,
  updateTarget,
} from "../services/target.js";

describe("target service", () => {
  let db: AppDatabase;

  beforeEach(() => {
    db = getTestDb();
  });

  it("creates and lists targets, with only one active", () => {
    const a = createTarget(db, {
      name: "balanced",
      allocations: [
        { asset_class: "us-stock", weight: 0.5 },
        { asset_class: "cash", weight: 0.5 },
      ],
      is_active: true,
    });
    const b = createTarget(db, {
      name: "aggressive",
      allocations: [
        { asset_class: "us-stock", weight: 0.9 },
        { asset_class: "cash", weight: 0.1 },
      ],
      is_active: true,
    });
    const all = listTargets(db);
    expect(all).toHaveLength(2);
    const active = getActiveTarget(db);
    expect(active?.id).toBe(b.id);
    // a should be flipped to inactive when b became active
    expect(all.find((t) => t.id === a.id)?.is_active).toBe(false);
  });

  it("rejects allocations that don't sum to 1", () => {
    expect(() =>
      createTarget(db, {
        name: "bad",
        allocations: [
          { asset_class: "us-stock", weight: 0.3 },
          { asset_class: "cash", weight: 0.3 },
        ],
      }),
    ).toThrow(/sum to 1/);
  });

  it("rejects unknown asset_class", () => {
    expect(() =>
      createTarget(db, {
        name: "bad",
        allocations: [
          { asset_class: "magic-beans" as never, weight: 1 },
        ],
      }),
    ).toThrow(/asset_class/);
  });

  it("setActiveTarget switches active row", () => {
    const a = createTarget(db, {
      name: "a",
      allocations: [{ asset_class: "cash", weight: 1 }],
      is_active: true,
    });
    const b = createTarget(db, {
      name: "b",
      allocations: [{ asset_class: "cash", weight: 1 }],
    });
    setActiveTarget(db, b.id);
    expect(getActiveTarget(db)?.id).toBe(b.id);
    setActiveTarget(db, a.id);
    expect(getActiveTarget(db)?.id).toBe(a.id);
  });

  it("updateTarget can change allocations and name", () => {
    const t = createTarget(db, {
      name: "v1",
      allocations: [{ asset_class: "cash", weight: 1 }],
    });
    const updated = updateTarget(db, t.id, {
      name: "v2",
      allocations: [
        { asset_class: "us-stock", weight: 0.6 },
        { asset_class: "cash", weight: 0.4 },
      ],
    });
    expect(updated.name).toBe("v2");
    expect(updated.allocations).toHaveLength(2);
  });

  it("deleteTarget removes the row", () => {
    const t = createTarget(db, {
      name: "rm",
      allocations: [{ asset_class: "cash", weight: 1 }],
    });
    deleteTarget(db, t.id);
    expect(listTargets(db)).toHaveLength(0);
  });

  it("checkTarget returns null when there is no active target", () => {
    expect(checkTarget(db)).toBeNull();
  });

  it("checkTarget produces gaps with correct status buckets", () => {
    // Build a portfolio: 100k cash (CNY).
    const cash = createAccount(db, { name: "Bank", type: "cash" });
    updateBalance(db, cash.id, 100000);

    // Active target: 50% cash, 50% us-stock — should be 50pp under target on us-stock
    createTarget(db, {
      name: "split",
      allocations: [
        { asset_class: "us-stock", weight: 0.5 },
        { asset_class: "cash", weight: 0.5 },
      ],
      is_active: true,
    });

    const result = checkTarget(db);
    expect(result).not.toBeNull();
    expect(result!.target_name).toBe("split");
    const usStock = result!.gaps.find((g) => g.asset_class === "us-stock");
    expect(usStock?.status).toBe("under");
    expect(usStock?.gap_weight).toBeLessThan(0);
    const cashGap = result!.gaps.find((g) => g.asset_class === "cash");
    expect(cashGap?.status).toBe("over");
    expect(cashGap?.gap_weight).toBeGreaterThan(0);
    expect(result!.max_drift).toBeGreaterThan(0.4);
  });

  it("checkTarget surfaces untargeted classes that hold value", () => {
    // 50k cash + a position in a class that's not in the target.
    const broker = createAccount(db, {
      name: "Broker",
      type: "brokerage",
      currency: "USD",
    });
    createPosition(db, {
      account_id: broker.id,
      symbol: "AAPL",
      quantity: 10,
      avg_cost: 100,
      current_price: 100,
      currency: "USD",
    });
    const cash = createAccount(db, { name: "Bank", type: "cash" });
    updateBalance(db, cash.id, 1000);

    // Target only specifies cash=1 — us-stock should appear as untargeted/over
    createTarget(db, {
      name: "cash-only",
      allocations: [{ asset_class: "cash", weight: 1 }],
      is_active: true,
    });

    const result = checkTarget(db);
    const us = result!.gaps.find((g) => g.asset_class === "us-stock");
    expect(us).toBeDefined();
    expect(us!.target_weight).toBe(0);
    expect(us!.current_weight).toBeGreaterThan(0);
  });
});
