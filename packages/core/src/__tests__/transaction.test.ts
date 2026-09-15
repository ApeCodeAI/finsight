/**
 * [INPUT]: isolated SQLite fixtures and transaction service functions.
 * [OUTPUT]: regression coverage for transaction recording and date filtering.
 * [POS]: core service tests for the authoritative transactions table.
 * [RUNTIME]: test.
 * [PROTOCOL]: traded_at remains a single verbatim date-or-timestamp field.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "../db/connection.js";
import type { AppDatabase } from "../db/connection.js";
import { createAccount } from "../services/account.js";
import { findOpenPosition } from "../services/position.js";
import {
  recordBuy,
  recordSell,
  recordTransfer,
  recordDeposit,
  recordWithdraw,
  listTransactions,
} from "../services/transaction.js";

describe("transaction service", () => {
  let db: AppDatabase;
  let accountId: string;

  beforeEach(() => {
    db = getTestDb();
    const acc = createAccount(db, {
      name: "Broker",
      type: "brokerage",
      currency: "HKD",
    });
    accountId = acc.id;
  });

  it("should record buy and create position", () => {
    const tx = recordBuy(db, {
      account_id: accountId,
      symbol: "00700.HK",
      name: "Tencent",
      quantity: 100,
      price: 380,
      currency: "HKD",
    });
    expect(tx.type).toBe("buy");
    expect(tx.amount).toBe(38000);
    expect(tx.position_id).toBeTruthy();

    const pos = findOpenPosition(db, accountId, "00700.HK");
    expect(pos).not.toBeNull();
    expect(pos!.quantity).toBe(100);
    expect(pos!.avg_cost).toBe(380);
  });

  it("preserves a supplied full timestamp on a buy", () => {
    const tradedAt = "2026-09-14T15:37:42.123-04:00";
    const tx = recordBuy(db, {
      account_id: accountId,
      symbol: "AAPL",
      quantity: 2,
      price: 200,
      traded_at: tradedAt,
    });

    expect(tx.traded_at).toBe(tradedAt);
  });

  it("should record buy and update existing position avg_cost", () => {
    recordBuy(db, {
      account_id: accountId,
      symbol: "00700.HK",
      quantity: 100,
      price: 380,
    });
    recordBuy(db, {
      account_id: accountId,
      symbol: "00700.HK",
      quantity: 100,
      price: 420,
    });

    const pos = findOpenPosition(db, accountId, "00700.HK");
    expect(pos!.quantity).toBe(200);
    expect(pos!.avg_cost).toBe(400); // (380*100 + 420*100) / 200
  });

  it("should record sell and update position", () => {
    recordBuy(db, {
      account_id: accountId,
      symbol: "00700.HK",
      quantity: 100,
      price: 380,
    });
    const tx = recordSell(db, {
      account_id: accountId,
      symbol: "00700.HK",
      quantity: 50,
      price: 400,
    });
    expect(tx.type).toBe("sell");

    const pos = findOpenPosition(db, accountId, "00700.HK");
    expect(pos!.quantity).toBe(50);
  });

  it("preserves a supplied full timestamp on a sell", () => {
    recordBuy(db, {
      account_id: accountId,
      symbol: "AAPL",
      quantity: 2,
      price: 200,
    });
    const tradedAt = "2026-09-14T15:37:42Z";
    const tx = recordSell(db, {
      account_id: accountId,
      symbol: "AAPL",
      quantity: 1,
      price: 210,
      traded_at: tradedAt,
    });

    expect(tx.traded_at).toBe(tradedAt);
  });

  it("should throw when selling without position", () => {
    expect(() =>
      recordSell(db, {
        account_id: accountId,
        symbol: "AAPL",
        quantity: 10,
        price: 200,
      })
    ).toThrow("No open position found");
  });

  it("should record transfer as two linked transactions", () => {
    const acc2 = createAccount(db, { name: "Bank", type: "cash" });
    const [out, inp] = recordTransfer(
      db,
      accountId,
      acc2.id,
      10000,
      "transfer funds"
    );
    expect(out.type).toBe("transfer_out");
    expect(inp.type).toBe("transfer_in");
    expect(out.counterpart_account_id).toBe(acc2.id);
    expect(inp.counterpart_account_id).toBe(accountId);
    expect(out.amount).toBe(10000);
    expect(inp.amount).toBe(10000);
  });

  it("should record deposit and withdraw with signed amounts", () => {
    const dep = recordDeposit(db, {
      account_id: accountId,
      amount: 50000,
      note: "initial deposit",
    });
    expect(dep.type).toBe("deposit");
    expect(dep.amount).toBe(50000); // positive

    const wd = recordWithdraw(db, { account_id: accountId, amount: 10000 });
    expect(wd.type).toBe("withdraw");
    expect(wd.amount).toBe(-10000); // negative — sign convention
  });

  it("rejects non-positive amounts", () => {
    expect(() =>
      recordDeposit(db, { account_id: accountId, amount: 0 }),
    ).toThrow();
    expect(() =>
      recordWithdraw(db, { account_id: accountId, amount: -10 }),
    ).toThrow();
  });

  it("should list transactions with filters", () => {
    recordDeposit(db, { account_id: accountId, amount: 50000 });
    recordBuy(db, {
      account_id: accountId,
      symbol: "00700.HK",
      quantity: 100,
      price: 380,
    });

    const all = listTransactions(db);
    expect(all).toHaveLength(2);

    const buys = listTransactions(db, { type: "buy" });
    expect(buys).toHaveLength(1);

    const byAccount = listTransactions(db, { account_id: accountId });
    expect(byAccount).toHaveLength(2);
  });

  it("includes full timestamps when a date-only upper bound is used", () => {
    recordBuy(db, {
      account_id: accountId,
      symbol: "AAPL",
      quantity: 1,
      price: 200,
      traded_at: "2026-09-14T15:37:42-04:00",
    });

    const sameDay = listTransactions(db, {
      from: "2026-09-14",
      to: "2026-09-14",
    });

    expect(sameDay).toHaveLength(1);
  });
});
