import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "@finsight/core";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];
const cliEntry = fileURLToPath(new URL("../index.ts", import.meta.url));

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "finsight-reconcile-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("reconcile mixed-currency account", () => {
  it("converts each position before comparing the broker total", () => {
    const home = makeTempDir();
    const databasePath = path.join(home, "authoritative.db");
    const db = getDb(databasePath);
    db.$client
      .prepare(
        `INSERT INTO accounts
          (id, name, type, currency, balance, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "mixed-account",
        "Mixed Broker",
        "brokerage",
        "CNY",
        100,
        1,
        "2026-09-15T00:00:00.000Z",
        "2026-09-15T00:00:00.000Z",
      );
    db.$client
      .prepare(
        `INSERT INTO exchange_rates
          (id, from_currency, to_currency, rate, rate_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "usd-cny",
        "USD",
        "CNY",
        7,
        "2026-09-15",
        "2026-09-15T00:00:00.000Z",
      );
    db.$client
      .prepare(
        `INSERT INTO exchange_rates
          (id, from_currency, to_currency, rate, rate_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "hkd-cny",
        "HKD",
        "CNY",
        0.9,
        "2026-09-15",
        "2026-09-15T00:00:00.000Z",
      );
    db.$client
      .prepare(
        `INSERT INTO positions
          (id, account_id, symbol, quantity, avg_cost, current_price, currency, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "usd-position",
        "mixed-account",
        "US-ASSET",
        10,
        20,
        20,
        "USD",
        "2026-09-15T00:00:00.000Z",
        "2026-09-15T00:00:00.000Z",
      );
    db.$client
      .prepare(
        `INSERT INTO positions
          (id, account_id, symbol, quantity, avg_cost, current_price, currency, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "hkd-position",
        "mixed-account",
        "HK-ASSET",
        100,
        10,
        10,
        "HKD",
        "2026-09-15T00:00:00.000Z",
        "2026-09-15T00:00:00.000Z",
      );
    db.$client.close();
    const configDir = path.join(home, ".finsight");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      path.join(configDir, "config.json"),
      `${JSON.stringify({ base_currency: "CNY" })}\n`,
    );

    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", cliEntry, "reconcile", "Mixed Broker", "--broker-total", "2400", "--json"],
      {
        cwd: path.dirname(cliEntry),
        encoding: "utf8",
        env: { ...process.env, HOME: home, FINSIGHT_DB_PATH: databasePath },
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout.trim())).toMatchObject({
      ok: true,
      account: "Mixed Broker",
      currency: "CNY",
      delta_pct: 0,
      computed_total_base: 2400,
      reconciliation: {
        computed_total: 2400,
        broker_total: 2400,
        currency: "CNY",
      },
    });
  });
});
