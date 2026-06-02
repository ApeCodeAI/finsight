import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { pushSchema } from "../db/connection.js";

describe("schema", () => {
  it("should create all core tables", () => {
    const sqlite = new Database(":memory:");
    pushSchema(sqlite);

    const tables = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      )
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain("accounts");
    expect(tableNames).toContain("positions");
    expect(tableNames).toContain("transactions");
    expect(tableNames).toContain("snapshots");
    expect(tableNames).toContain("exchange_rates");
    expect(tableNames).toContain("decisions");
    expect(tableNames).toContain("targets");
    expect(tableNames).toContain("reconciliations");

    // Removed features must not exist.
    expect(tableNames).not.toContain("incomes");
    expect(tableNames).not.toContain("monthly_expenses");
  });

  it("should be idempotent (running pushSchema twice is fine)", () => {
    const sqlite = new Database(":memory:");
    pushSchema(sqlite);
    pushSchema(sqlite);

    const tables = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      )
      .all() as { name: string }[];

    // accounts, positions, transactions, snapshots, exchange_rates,
    // decisions, targets, reconciliations
    expect(tables.length).toBe(8);
  });

  it("drops legacy incomes / monthly_expenses tables on upgrade", () => {
    const sqlite = new Database(":memory:");
    // Pretend an old DB has these tables.
    sqlite.exec("CREATE TABLE incomes (id TEXT PRIMARY KEY)");
    sqlite.exec("CREATE TABLE monthly_expenses (id TEXT PRIMARY KEY)");
    pushSchema(sqlite);
    const tableNames = (
      sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as { name: string }[]
    ).map((t) => t.name);
    expect(tableNames).not.toContain("incomes");
    expect(tableNames).not.toContain("monthly_expenses");
  });
});
