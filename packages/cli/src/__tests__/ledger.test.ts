import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "@finsight/core";
import { afterEach, describe, expect, it } from "vitest";
import {
  requireLegacyImportConfirmation,
  resolveLegacyLedgerDir,
} from "../commands/ledger.js";

const tempDirs: string[] = [];
const cliEntry = fileURLToPath(new URL("../index.ts", import.meta.url));

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "finsight-ledger-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("legacy ledger export destination", () => {
  it.each(["sync", "export"])(
    "%s fails closed when neither --dir nor ledger-dir is configured",
    () => {
      expect(() => resolveLegacyLedgerDir(undefined, undefined)).toThrow(
        /No legacy ledger directory specified/,
      );
      expect(() => resolveLegacyLedgerDir("   ", "")).toThrow(
        /No legacy ledger directory specified/,
      );
    },
  );

  it("resolves an explicit directory without falling back to cwd", () => {
    expect(resolveLegacyLedgerDir("./legacy-export", undefined)).toBe(
      path.resolve("legacy-export"),
    );
  });

  it("requires --yes for a lossy legacy import even in JSON mode", () => {
    expect(() => requireLegacyImportConfirmation(false)).toThrow(
      /requires --yes/,
    );
    expect(() => requireLegacyImportConfirmation(true)).not.toThrow();
  });
});

describe("ledger purge confirmation", () => {
  it("requires --yes in JSON mode and leaves the database unchanged", () => {
    const home = makeTempDir();
    const databasePath = path.join(home, "authoritative.db");
    const db = getDb(databasePath);
    db.$client
      .prepare(
        `INSERT INTO accounts
          (id, name, type, currency, balance, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("account-1", "Cash", "cash", "USD", 10, 1, "2025-01-01", "2025-01-01");
    db.$client
      .prepare(
        `INSERT INTO transactions
          (id, account_id, type, amount, fee, currency, traded_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("tx-1", "account-1", "deposit", 10, 0, "USD", "2025-01-01", "2025-01-01");
    db.$client
      .prepare(
        `INSERT INTO snapshots
          (id, snapshot_date, total_net_worth, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run("snapshot-1", "2025-01-01", 10, "2025-01-01");
    db.$client.pragma("journal_mode = DELETE");
    db.$client.close();
    const before = readFileSync(databasePath);

    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        cliEntry,
        "ledger",
        "purge",
        "--before",
        "2026-01-01",
        "--json",
      ],
      {
        cwd: path.dirname(cliEntry),
        encoding: "utf8",
        env: { ...process.env, HOME: home, FINSIGHT_DB_PATH: databasePath },
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr.trim())).toMatchObject({
      code: "USER_ERROR",
      error: expect.stringContaining("--yes"),
    });
    expect(readFileSync(databasePath)).toEqual(before);
  });
});
