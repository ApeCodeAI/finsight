import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "@finsight/core";
import { afterEach, describe, expect, it } from "vitest";
import { collectInitAnswersFromFlags } from "../commands/init.js";

const tempDirs: string[] = [];
const cliEntry = fileURLToPath(new URL("../index.ts", import.meta.url));
const repoRoot = path.resolve(path.dirname(cliEntry), "../../..");

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "finsight-init-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("init defaults", () => {
  it("does not configure or default a legacy ledger directory", () => {
    expect(collectInitAnswersFromFlags({})).toEqual({
      base_currency: "USD",
      display_locale: "en-US",
      labels_language: "en",
      demo: "none",
    });
  });

  it("rejects demo loading into an existing authoritative database", () => {
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
        "existing-account",
        "Authoritative portfolio",
        "brokerage",
        "USD",
        1234,
        1,
        "2026-09-15T00:00:00.000Z",
        "2026-09-15T00:00:00.000Z",
      );
    db.$client.close();

    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        cliEntry,
        "init",
        "--non-interactive",
        "--demo",
        "en",
        "--force",
        "--json",
      ],
      {
        cwd: path.dirname(cliEntry),
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: home,
          FINSIGHT_DB_PATH: databasePath,
          FINSIGHT_HOME: repoRoot,
        },
      },
    );

    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr.trim())).toMatchObject({
      code: "DATA_CONFLICT",
    });

    const preserved = getDb(databasePath);
    expect(
      preserved.$client
        .prepare("SELECT id, name, balance FROM accounts")
        .all(),
    ).toEqual([
      {
        id: "existing-account",
        name: "Authoritative portfolio",
        balance: 1234,
      },
    ]);
    preserved.$client.close();
  });
});
