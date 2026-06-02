import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "../db/connection.js";
import type { AppDatabase } from "../db/connection.js";
import {
  createAccount,
  listAccounts,
  getAccount,
  editAccount,
  archiveAccount,
  updateBalance,
} from "../services/account.js";

describe("account service", () => {
  let db: AppDatabase;

  beforeEach(() => {
    db = getTestDb();
  });

  it("should create an account with ULID id", () => {
    const acc = createAccount(db, {
      name: "Test Bank",
      type: "cash",
      currency: "CNY",
      institution: "ICBC",
    });
    expect(acc.id).toHaveLength(26); // ULID length
    expect(acc.name).toBe("Test Bank");
    expect(acc.type).toBe("cash");
    expect(acc.balance).toBe(0);
    expect(acc.is_active).toBe(1);
  });

  it("should list all active accounts", () => {
    createAccount(db, { name: "A1", type: "cash" });
    createAccount(db, { name: "A2", type: "brokerage" });
    const list = listAccounts(db);
    expect(list).toHaveLength(2);
  });

  it("should filter accounts by type", () => {
    createAccount(db, { name: "Cash", type: "cash" });
    createAccount(db, { name: "Broker", type: "brokerage" });
    const list = listAccounts(db, { type: "cash" });
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe("cash");
  });

  it("should get account by id", () => {
    const acc = createAccount(db, { name: "Test", type: "cash" });
    const found = getAccount(db, acc.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Test");
  });

  it("should return null for non-existent account", () => {
    const found = getAccount(db, "nonexistent");
    expect(found).toBeNull();
  });

  it("should edit account fields", () => {
    const acc = createAccount(db, { name: "Old Name", type: "cash" });
    const updated = editAccount(db, acc.id, { name: "New Name" });
    expect(updated!.name).toBe("New Name");
  });

  it("should archive account", () => {
    const acc = createAccount(db, { name: "To Archive", type: "cash" });
    archiveAccount(db, acc.id);
    const found = getAccount(db, acc.id);
    expect(found!.is_active).toBe(0);
    // Should not appear in default list
    const list = listAccounts(db);
    expect(list).toHaveLength(0);
  });

  it("should update balance", () => {
    const acc = createAccount(db, { name: "Bank", type: "cash" });
    const updated = updateBalance(db, acc.id, 50000, "salary deposit");
    expect(updated!.balance).toBe(50000);
    expect(updated!.notes).toBe("salary deposit");
  });
});
