import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "@finsight/core";
import { afterEach, describe, expect, it } from "vitest";
import { collectStorageHealthChecks } from "../commands/doctor.js";

const tempDirs: string[] = [];
const cliEntry = fileURLToPath(new URL("../index.ts", import.meta.url));

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "finsight-doctor-test-"));
  tempDirs.push(dir);
  return dir;
}

function runDoctor(home: string, databasePath: string) {
  return spawnSync(process.execPath, ["--import", "tsx", cliEntry, "doctor", "--json"], {
    cwd: path.dirname(cliEntry),
    encoding: "utf8",
    env: { ...process.env, HOME: home, FINSIGHT_DB_PATH: databasePath },
  });
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("doctor storage checks", () => {
  it("treats an unconfigured legacy ledger as normal and checks SQLite integrity", () => {
    const root = makeTempDir();
    const databasePath = path.join(root, "finsight.db");
    const db = getDb(databasePath);
    db.$client.close();

    const checks = collectStorageHealthChecks({
      databasePath,
      ledgerDir: undefined,
    });

    expect(checks).toContainEqual({
      name: "db.integrity",
      level: "ok",
      message: `SQLite integrity check passed: ${databasePath}`,
    });
    expect(checks).toContainEqual({
      name: "ledger.legacy",
      level: "ok",
      message: "Legacy ledger export/import is not configured (normal).",
    });
    expect(checks.some((check) => check.name === "ledger.sync")).toBe(false);
  });

  it("reports a missing database without creating it", () => {
    const home = makeTempDir();
    const databasePath = path.join(home, "missing", "finsight.db");

    const result = runDoctor(home, databasePath);

    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr.trim())).toMatchObject({
      code: "DATA_CONFLICT",
    });
    expect(existsSync(databasePath)).toBe(false);
    expect(existsSync(path.dirname(databasePath))).toBe(false);
  });

  it("reads healthy content without mutating the database", () => {
    const home = makeTempDir();
    const databasePath = path.join(home, "healthy.db");
    const db = getDb(databasePath);
    db.$client
      .prepare(
        `INSERT INTO accounts
          (id, name, type, currency, balance, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "doctor-account",
        "Doctor account",
        "cash",
        "USD",
        50,
        1,
        "2026-09-15T00:00:00.000Z",
        "2026-09-15T00:00:00.000Z",
      );
    db.$client.pragma("journal_mode = DELETE");
    db.$client.exec("CREATE TABLE incomes (id TEXT PRIMARY KEY)");
    db.$client.close();
    const before = readFileSync(databasePath);

    const result = runDoctor(home, databasePath);

    const after = readFileSync(databasePath);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const payload = JSON.parse(result.stdout.trim()) as {
      checks: Array<{ name: string; message: string }>;
    };
    expect(payload.checks).toContainEqual(
      expect.objectContaining({
        name: "db.content",
        message: expect.stringContaining("accounts=1"),
      }),
    );
    expect(after).toEqual(before);
  });
});
