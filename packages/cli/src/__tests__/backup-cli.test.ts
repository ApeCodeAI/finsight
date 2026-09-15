import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@finsight/core";
import { createBackupCommand } from "../commands/backup.js";

const tempDirs: string[] = [];
const originalDbPath = process.env.FINSIGHT_DB_PATH;

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "finsight-backup-cli-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
  if (originalDbPath === undefined) delete process.env.FINSIGHT_DB_PATH;
  else process.env.FINSIGHT_DB_PATH = originalDbPath;
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("backup CLI", () => {
  it("creates and verifies SQLite backups with structured JSON", async () => {
    const root = makeTempDir();
    const sourcePath = path.join(root, "source.db");
    const destinationDir = path.join(root, "backups");
    const db = getDb(sourcePath);
    db.$client.close();
    process.env.FINSIGHT_DB_PATH = sourcePath;

    const lines: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      lines.push(String(chunk));
      return true;
    });

    await createBackupCommand().parseAsync(
      ["create", "--dir", destinationDir, "--json"],
      { from: "user" },
    );
    const created = JSON.parse(lines.pop() ?? "null") as Record<string, unknown>;

    expect(created).toMatchObject({
      ok: true,
      operation: "backup.create",
      source_path: sourcePath,
      source_integrity: "ok",
      backup_integrity: "ok",
      mode: "0600",
    });
    expect(created.backup_path).toEqual(expect.any(String));
    expect(created.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(created.bytes).toEqual(expect.any(Number));

    await createBackupCommand().parseAsync(
      ["verify", String(created.backup_path), "--json"],
      { from: "user" },
    );
    const verified = JSON.parse(lines.pop() ?? "null") as Record<string, unknown>;

    expect(verified).toEqual({
      ok: true,
      operation: "backup.verify",
      backup_path: created.backup_path,
      integrity: "ok",
      sha256: created.sha256,
      bytes: created.bytes,
      mode: "0600",
    });
  });
});
