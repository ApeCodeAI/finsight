/**
 * [INPUT]: the public trade command definitions and temporary SQLite stores.
 * [OUTPUT]: regression coverage for optional full trade timestamps and display.
 * [POS]: CLI command-surface and human-readable output tests.
 * [RUNTIME]: test.
 * [PROTOCOL]: keep the public `--traded-at` contract aligned with both commands;
 *             date-only traded_at values remain readable as before.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAccount, getDb, recordBuy } from "@finsight/core";
import { afterEach, describe, expect, it } from "vitest";
import { tradeCmd } from "../commands/trade.js";

const cliEntry = fileURLToPath(new URL("../index.ts", import.meta.url));
const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "finsight-trade-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function seedBroker(root: string): string {
  const databasePath = path.join(root, "finsight.db");
  const db = getDb(databasePath);
  createAccount(db, {
    name: "Broker",
    type: "brokerage",
    currency: "USD",
  });
  db.$client.close();
  return databasePath;
}

function runCli(databasePath: string, ...args: string[]) {
  return spawnSync(
    process.execPath,
    ["--import", "tsx", cliEntry, ...args],
    {
      cwd: path.dirname(cliEntry),
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: path.dirname(databasePath),
        FINSIGHT_DB_PATH: databasePath,
      },
    },
  );
}

function findTradeCommand(name: "buy" | "sell") {
  const command = tradeCmd.commands.find((candidate) => candidate.name() === name);
  if (!command) throw new Error(`Missing trade ${name} command`);
  return command;
}

describe("trade timestamp option", () => {
  it.each(["buy", "sell"] as const)("exposes --traded-at for %s", (name) => {
    expect(
      findTradeCommand(name).options.some((option) => option.long === "--traded-at"),
    ).toBe(true);
  });

  it("stores a supplied full timestamp verbatim through trade buy", () => {
    const root = makeTempDir();
    const databasePath = seedBroker(root);
    const tradedAt = "2026-09-14T15:37:42-04:00";

    const result = runCli(
      databasePath,
      "trade",
      "buy",
      "Broker",
      "AAPL",
      "1",
      "--no-quote",
      "--price",
      "200",
      "--traded-at",
      tradedAt,
      "--json",
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout.trim()).transaction.traded_at).toBe(tradedAt);
  });

  it("keeps the existing date-only --date storage behavior", () => {
    const root = makeTempDir();
    const databasePath = seedBroker(root);

    const result = runCli(
      databasePath,
      "trade",
      "buy",
      "Broker",
      "AAPL",
      "1",
      "--no-quote",
      "--price",
      "200",
      "--date",
      "2025-11-15",
      "--json",
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout.trim()).transaction.traded_at).toBe("2025-11-15");
  });

  it("rejects a malformed --traded-at value as a user error", () => {
    const root = makeTempDir();
    const databasePath = seedBroker(root);

    const result = runCli(
      databasePath,
      "trade",
      "buy",
      "Broker",
      "AAPL",
      "1",
      "--no-quote",
      "--price",
      "200",
      "--traded-at",
      "2026-09-14",
      "--json",
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr.trim())).toMatchObject({
      code: "USER_ERROR",
      error: expect.stringContaining("Invalid --traded-at"),
    });
  });

  it("shows a supplied full timestamp in human-readable trade list output", () => {
    const root = makeTempDir();
    const databasePath = path.join(root, "finsight.db");
    const db = getDb(databasePath);
    const account = createAccount(db, {
      name: "Broker",
      type: "brokerage",
      currency: "USD",
    });
    const tradedAt = "2026-09-14T15:37:42-04:00";
    recordBuy(db, {
      account_id: account.id,
      symbol: "AAPL",
      quantity: 1,
      price: 200,
      currency: "USD",
      traded_at: tradedAt,
    });
    db.$client.close();

    const result = runCli(databasePath, "trade", "list");

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(tradedAt);
  });

  it("shows a supplied full timestamp in transaction review output", () => {
    const root = makeTempDir();
    const databasePath = path.join(root, "finsight.db");
    const db = getDb(databasePath);
    const account = createAccount(db, {
      name: "Broker",
      type: "brokerage",
      currency: "USD",
    });
    const tradedAt = "2026-09-14T15:37:42-04:00";
    recordBuy(db, {
      account_id: account.id,
      symbol: "AAPL",
      quantity: 1,
      price: 200,
      currency: "USD",
      traded_at: tradedAt,
      needs_review: 1,
    });
    db.$client.close();

    const result = runCli(databasePath, "transaction", "review");

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(tradedAt);
  });
});
