import { Command } from "commander";
import chalk from "chalk";
import path from "node:path";
import {
  createSqliteBackup,
  verifySqliteBackup,
} from "@finsight/core";
import { emitJson, fail } from "../utils/exit.js";
import { printInfo, printSuccess } from "../utils/display.js";

export function createBackupCommand(): Command {
  const command = new Command("backup").description(
    "Create and verify native backups of the authoritative SQLite database",
  );

  command
    .command("create")
    .description(
      "Create an integrity-checked SQLite backup (default: ~/.finsight/backups)",
    )
    .option("--dir <dir>", "Backup directory (default: ~/.finsight/backups)")
    .option("--json", "Emit structured JSON")
    .action(async (opts) => {
      try {
        const result = await createSqliteBackup({
          destinationDir: opts.dir ? expandHome(opts.dir) : undefined,
        });
        const payload = { ok: true, operation: "backup.create", ...result };
        if (opts.json) {
          emitJson(payload);
          return;
        }
        printSuccess(`Created verified SQLite backup: ${result.backup_path}`);
        printInfo(`SHA-256: ${result.sha256}`);
        printInfo(`Bytes: ${result.bytes} · mode: ${result.mode}`);
      } catch (error) {
        fail("DATA_CONFLICT", errorMessage(error), { json: opts.json });
      }
    });

  command
    .command("verify")
    .description("Verify SQLite integrity and report backup metadata")
    .argument("<file>", "Existing SQLite backup file")
    .option("--json", "Emit structured JSON")
    .action(async (file, opts) => {
      try {
        const result = await verifySqliteBackup(expandHome(file));
        const payload = { ok: true, operation: "backup.verify", ...result };
        if (opts.json) {
          emitJson(payload);
          return;
        }
        printSuccess(`Verified SQLite backup: ${result.backup_path}`);
        printInfo(`Integrity: ${chalk.green(result.integrity)}`);
        printInfo(`SHA-256: ${result.sha256}`);
        printInfo(`Bytes: ${result.bytes} · mode: ${result.mode}`);
      } catch (error) {
        fail("DATA_CONFLICT", errorMessage(error), { json: opts.json });
      }
    });

  return command;
}

export const backupCmd = createBackupCommand();

function expandHome(value: string): string {
  if (value === "~") return process.env.HOME ?? value;
  if (value.startsWith("~/")) {
    return path.join(process.env.HOME ?? "", value.slice(2));
  }
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
