import Database from "better-sqlite3";
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  createReadStream,
  existsSync,
  mkdtempSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { getDbPath } from "../config/index.js";

export interface CreateSqliteBackupOptions {
  sourcePath?: string;
  destinationDir?: string;
  now?: Date;
}

export interface SqliteBackupResult {
  source_path: string;
  backup_path: string;
  created_at: string;
  source_integrity: "ok";
  backup_integrity: "ok";
  sha256: string;
  bytes: number;
  mode: string;
}

export interface SqliteBackupVerification {
  backup_path: string;
  integrity: "ok";
  sha256: string;
  bytes: number;
  mode: string;
}

export interface SqliteIntegrityResult {
  database_path: string;
  integrity: "ok";
}

export function getDefaultBackupDir(): string {
  return path.join(homedir(), ".finsight", "backups");
}

export function checkSqliteIntegrity(
  databasePath = getDbPath(),
): SqliteIntegrityResult {
  const resolvedPath = path.resolve(databasePath);
  const database = new Database(resolvedPath, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    assertIntegrity(database, resolvedPath);
    return { database_path: resolvedPath, integrity: "ok" };
  } finally {
    database.close();
  }
}

/**
 * Create a native SQLite online backup in a private temporary directory,
 * validate it, then move it into the backup directory.
 *
 * FinSight is a single-user local MVP. This deliberately uses a small,
 * retryable file workflow rather than a hardened multi-process protocol.
 */
export async function createSqliteBackup(
  options: CreateSqliteBackupOptions = {},
): Promise<SqliteBackupResult> {
  const sourcePath = path.resolve(options.sourcePath ?? getDbPath());
  const destinationDir = path.resolve(
    options.destinationDir ?? getDefaultBackupDir(),
  );
  const now = options.now ?? new Date();

  mkdirSync(destinationDir, { recursive: true, mode: 0o700 });
  const timestamp = formatFilenameTimestamp(now);
  const suffix = randomBytes(16).toString("hex");
  const backupPath = path.join(
    destinationDir,
    `finsight-${timestamp}-${suffix}.sqlite3`,
  );
  const stagingDirectory = mkdtempSync(
    path.join(path.dirname(destinationDir), ".finsight-backup-stage-"),
  );
  chmodSync(stagingDirectory, 0o700);
  const temporaryPath = path.join(stagingDirectory, path.basename(backupPath));

  try {
    const source = new Database(sourcePath, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      assertIntegrity(source, sourcePath);
      await source.backup(temporaryPath);
    } finally {
      source.close();
    }

    chmodSync(temporaryPath, 0o600);
    const backup = new Database(temporaryPath, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      assertIntegrity(backup, temporaryPath);
    } finally {
      backup.close();
    }

    const sha256 = await sha256File(temporaryPath);
    const stagedStats = statSync(temporaryPath);
    if (formatMode(stagedStats.mode) !== "0600") {
      throw new Error(`SQLite backup permissions are not 0600: ${temporaryPath}`);
    }
    if (existsSync(backupPath)) {
      throw new Error(`Backup destination already exists: ${backupPath}`);
    }

    renameSync(temporaryPath, backupPath);
    const publishedStats = statSync(backupPath);
    return {
      source_path: sourcePath,
      backup_path: backupPath,
      created_at: now.toISOString(),
      source_integrity: "ok",
      backup_integrity: "ok",
      sha256,
      bytes: publishedStats.size,
      mode: formatMode(publishedStats.mode),
    };
  } finally {
    rmSync(stagingDirectory, { recursive: true, force: true });
  }
}

export async function verifySqliteBackup(
  backupPath: string,
): Promise<SqliteBackupVerification> {
  const resolvedPath = path.resolve(backupPath);
  const backup = new Database(resolvedPath, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    assertIntegrity(backup, resolvedPath);
  } finally {
    backup.close();
  }

  const sha256 = await sha256File(resolvedPath);
  const stats = statSync(resolvedPath);
  return {
    backup_path: resolvedPath,
    integrity: "ok",
    sha256,
    bytes: stats.size,
    mode: formatMode(stats.mode),
  };
}

function assertIntegrity(
  database: InstanceType<typeof Database>,
  filePath: string,
): void {
  let rows: Array<{ integrity_check: string }>;
  try {
    rows = database.pragma("integrity_check") as Array<{
      integrity_check: string;
    }>;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `SQLite integrity check failed for ${filePath}: ${detail}`,
      { cause: error },
    );
  }
  const messages = rows.map((row) => row.integrity_check);
  if (messages.length !== 1 || messages[0] !== "ok") {
    throw new Error(
      `SQLite integrity check failed for ${filePath}: ${messages.join("; ") || "no result"}`,
    );
  }
}

function formatFilenameTimestamp(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new Error("Invalid backup timestamp");
  return date.toISOString().replace(/[-:.]/g, "");
}

function formatMode(mode: number): string {
  return (mode & 0o777).toString(8).padStart(4, "0");
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}
