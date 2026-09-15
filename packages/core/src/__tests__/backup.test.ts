import Database from "better-sqlite3";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkSqliteIntegrity,
  createSqliteBackup,
  verifySqliteBackup,
} from "../db/backup.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "finsight-backup-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("createSqliteBackup", () => {
  it("creates a verified online backup that includes committed WAL data", async () => {
    const root = makeTempDir();
    const sourcePath = path.join(root, "source.db");
    const destinationDir = path.join(root, "backups");
    const source = new Database(sourcePath);
    source.pragma("journal_mode = WAL");
    source.exec("CREATE TABLE entries (value TEXT NOT NULL)");
    source.prepare("INSERT INTO entries (value) VALUES (?)").run("from-wal");

    try {
      const result = await createSqliteBackup({
        sourcePath,
        destinationDir,
        now: new Date("2026-09-15T02:00:00.123Z"),
      });

      expect(path.dirname(result.backup_path)).toBe(destinationDir);
      expect(path.basename(result.backup_path)).toMatch(
        /^finsight-20260915T020000123Z-[a-f0-9]{32}\.sqlite3$/,
      );
      expect(result.source_integrity).toBe("ok");
      expect(result.backup_integrity).toBe("ok");
      expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(result.bytes).toBe(statSync(result.backup_path).size);
      expect(result.mode).toBe("0600");
      expect(statSync(result.backup_path).mode & 0o777).toBe(0o600);

      const backup = new Database(result.backup_path, {
        readonly: true,
        fileMustExist: true,
      });
      try {
        expect(
          backup.prepare("SELECT value FROM entries").get(),
        ).toEqual({ value: "from-wal" });
      } finally {
        backup.close();
      }
    } finally {
      source.close();
    }
  });
});

describe("checkSqliteIntegrity", () => {
  it("reports integrity for an existing authoritative database", () => {
    const root = makeTempDir();
    const sourcePath = path.join(root, "source.db");
    const source = new Database(sourcePath);
    source.exec("CREATE TABLE entries (value TEXT NOT NULL)");
    source.close();

    expect(checkSqliteIntegrity(sourcePath)).toEqual({
      database_path: sourcePath,
      integrity: "ok",
    });
  });
});

describe("verifySqliteBackup", () => {
  it("checks integrity and reports stable metadata", async () => {
    const root = makeTempDir();
    const sourcePath = path.join(root, "source.db");
    const source = new Database(sourcePath);
    source.exec(
      "CREATE TABLE entries (value TEXT NOT NULL); INSERT INTO entries VALUES ('saved')",
    );
    source.close();

    const created = await createSqliteBackup({
      sourcePath,
      destinationDir: path.join(root, "backups"),
    });
    const verified = await verifySqliteBackup(created.backup_path);

    expect(verified).toEqual({
      backup_path: created.backup_path,
      integrity: "ok",
      sha256: created.sha256,
      bytes: created.bytes,
      mode: "0600",
    });
  });

  it("rejects a corrupt backup with an integrity-check error", async () => {
    const root = makeTempDir();
    const backupPath = path.join(root, "corrupt.sqlite3");
    writeFileSync(backupPath, "not a sqlite database", { mode: 0o600 });

    await expect(verifySqliteBackup(backupPath)).rejects.toThrow(
      /SQLite integrity check failed/,
    );
    expect(existsSync(backupPath)).toBe(true);
    expect(readFileSync(backupPath, "utf8")).toBe("not a sqlite database");
  });
});
