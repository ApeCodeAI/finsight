import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getTestDb, type AppDatabase } from "../db/connection.js";
import { createAccount, updateBalance } from "../services/account.js";
import { recordBuy } from "../services/transaction.js";
import { takeSnapshot } from "../services/snapshot.js";
import { recordReconciliation } from "../services/reconciliation.js";
import { dumpDbToLedger, rebuildDbFromLedger, verifyLedgerVsDb } from "../ledger/sync.js";

/**
 * Build a small but exhaustive portfolio so every JSONL file has at least one
 * row (and round-trips can be checked end-to-end).
 */
function seed(db: AppDatabase): { accountId: string } {
  const cash = createAccount(db, {
    name: "Bank",
    type: "cash",
    currency: "CNY",
  });
  updateBalance(db, cash.id, 100000);

  const broker = createAccount(db, {
    name: "Broker",
    type: "brokerage",
    currency: "USD",
  });
  // recordBuy creates the position + transaction together.
  recordBuy(db, {
    account_id: broker.id,
    symbol: "AAPL",
    quantity: 10,
    price: 150,
    currency: "USD",
    traded_at: "2026-01-15",
  });

  takeSnapshot(db, "test-snapshot-1");
  takeSnapshot(db, "test-snapshot-2");

  recordReconciliation(db, {
    account_id: broker.id,
    currency: "USD",
    computed_total: 1800,
    broker_total: 1805.5,
    reconciled_at: "2026-05-28",
    notes: "broker showed slightly more",
  });

  return { accountId: broker.id };
}

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "finsight-ledger-jsonl-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("ledger JSONL layout", () => {
  it("dumps every table to its expected file", () => {
    const db = getTestDb();
    seed(db);
    const result = dumpDbToLedger(db, root);

    expect(result.snapshots).toBe(2);
    expect(result.fx_rates).toBeGreaterThan(0); // seed fallback when empty
    expect(result.reconciliations).toBe(1);

    // Files exist at expected paths.
    expect(existsSync(path.join(root, "snapshots.jsonl"))).toBe(true);
    expect(existsSync(path.join(root, "fx-rates.jsonl"))).toBe(true);
    expect(existsSync(path.join(root, "reconciliations.jsonl"))).toBe(true);

    // Legacy / removed paths do NOT exist.
    expect(existsSync(path.join(root, "snapshots"))).toBe(false);
    expect(existsSync(path.join(root, "fx-rates.yaml"))).toBe(false);
    expect(existsSync(path.join(root, "incomes.jsonl"))).toBe(false);
    expect(existsSync(path.join(root, "expenses.jsonl"))).toBe(false);
  });

  it("writes valid JSONL (one JSON object per line)", () => {
    const db = getTestDb();
    seed(db);
    dumpDbToLedger(db, root);

    for (const file of [
      "snapshots.jsonl",
      "fx-rates.jsonl",
      "reconciliations.jsonl",
    ]) {
      const txt = readFileSync(path.join(root, file), "utf8");
      const lines = txt.split("\n").filter((l) => l.length > 0);
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    }
  });

  it("round-trips: dump → wipe DB → load → counts match", () => {
    const db1 = getTestDb();
    seed(db1);
    const dump = dumpDbToLedger(db1, root);

    // Fresh DB, restore from ledger.
    const db2 = getTestDb();
    const restore = rebuildDbFromLedger(db2, root);

    expect(restore.accounts).toBe(dump.accounts);
    expect(restore.positions).toBe(dump.positions);
    expect(restore.transactions).toBe(dump.transactions);
    expect(restore.snapshots).toBe(dump.snapshots);
    expect(restore.fx_rates).toBe(dump.fx_rates);
    expect(restore.reconciliations).toBe(dump.reconciliations);

    // And verify reports in-sync.
    const diff = verifyLedgerVsDb(db2, root);
    expect(diff.in_sync).toBe(true);
  });

  it("preserves fx rate dates through round-trip (history not collapsed)", () => {
    const db = getTestDb();
    seed(db);
    dumpDbToLedger(db, root);
    const lines = readFileSync(path.join(root, "fx-rates.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    for (const row of lines) {
      expect(row).toHaveProperty("date");
      expect(row).toHaveProperty("from");
      expect(row).toHaveProperty("to");
      expect(row).toHaveProperty("rate");
      expect(typeof row.date).toBe("string");
    }
  });
});

describe("legacy migration", () => {
  it("reads legacy snapshots/*.json when snapshots.jsonl is absent", () => {
    // Hand-build a vault with the old layout.
    mkdirSync(path.join(root, "snapshots"), { recursive: true });
    writeFileSync(
      path.join(root, "snapshots", "2024-01-01.json"),
      JSON.stringify({
        schema_version: 1,
        date: "2024-01-01",
        total_net_worth: 50000,
        currency: "CNY",
        notes: null,
        accounts: [],
      }),
    );
    writeFileSync(
      path.join(root, "snapshots", "2024-02-01.json"),
      JSON.stringify({
        schema_version: 1,
        date: "2024-02-01",
        total_net_worth: 55000,
        currency: "CNY",
        notes: null,
        accounts: [],
      }),
    );
    // minimal accounts.yaml so readLedger doesn't choke
    writeFileSync(
      path.join(root, "accounts.yaml"),
      "schema_version: 1\naccounts: []\n",
    );

    const db = getTestDb();
    const restore = rebuildDbFromLedger(db, root);
    expect(restore.snapshots).toBe(2);

    // After a sync, legacy folder is gone and snapshots.jsonl exists.
    dumpDbToLedger(db, root);
    expect(existsSync(path.join(root, "snapshots"))).toBe(false);
    expect(existsSync(path.join(root, "snapshots.jsonl"))).toBe(true);
  });

  it("cleans up dropped incomes.jsonl / expenses.jsonl on sync", () => {
    // Simulate an upgrading user whose vault still has these.
    writeFileSync(
      path.join(root, "accounts.yaml"),
      "schema_version: 1\naccounts: []\n",
    );
    writeFileSync(
      path.join(root, "incomes.jsonl"),
      '{"id":"x","date":"2026-01","source":"salary","amount":1}\n',
    );
    writeFileSync(path.join(root, "expenses.jsonl"), "");

    const db = getTestDb();
    dumpDbToLedger(db, root);
    expect(existsSync(path.join(root, "incomes.jsonl"))).toBe(false);
    expect(existsSync(path.join(root, "expenses.jsonl"))).toBe(false);
  });

  it("reads legacy fx-rates.yaml when fx-rates.jsonl is absent", () => {
    writeFileSync(
      path.join(root, "accounts.yaml"),
      "schema_version: 1\naccounts: []\n",
    );
    writeFileSync(
      path.join(root, "fx-rates.yaml"),
      "schema_version: 1\nrates:\n  USD:\n    CNY: 7.12\n  HKD:\n    CNY: 0.91\n",
    );

    const db = getTestDb();
    const restore = rebuildDbFromLedger(db, root);
    expect(restore.fx_rates).toBe(2);

    // After sync, legacy yaml is gone.
    dumpDbToLedger(db, root);
    expect(existsSync(path.join(root, "fx-rates.yaml"))).toBe(false);
    expect(existsSync(path.join(root, "fx-rates.jsonl"))).toBe(true);
  });
});
