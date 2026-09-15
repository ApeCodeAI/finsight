import { Command } from "commander";
import chalk from "chalk";
import { existsSync, statSync } from "node:fs";
import {
  listAccounts,
  listPositions,
  listTransactions,
  listSnapshots,
  listDecisions,
  listTransactionsNeedingRationale,
  getActiveTarget,
  getEffectiveConfig,
  getDbPath,
  getReadOnlyDb,
  checkSqliteIntegrity,
} from "@finsight/core";
import { emitJson, fail, ExitCode } from "../utils/exit.js";

type CheckLevel = "ok" | "warn" | "error";
export interface Check {
  name: string;
  level: CheckLevel;
  message: string;
  hint?: string;
}

export function collectStorageHealthChecks(input: {
  databasePath: string;
  ledgerDir?: string;
}): Check[] {
  const checks: Check[] = [];
  try {
    const result = checkSqliteIntegrity(input.databasePath);
    checks.push({
      name: "db.integrity",
      level: "ok",
      message: `SQLite integrity check passed: ${result.database_path}`,
    });
  } catch (error) {
    checks.push({
      name: "db.integrity",
      level: "error",
      message: error instanceof Error ? error.message : String(error),
      hint: "Recover only from a verified SQLite backup.",
    });
  }

  if (!input.ledgerDir?.trim()) {
    checks.push({
      name: "ledger.legacy",
      level: "ok",
      message: "Legacy ledger export/import is not configured (normal).",
    });
  } else if (!existsSync(input.ledgerDir)) {
    checks.push({
      name: "ledger.legacy",
      level: "warn",
      message: `Configured legacy ledger directory is missing: ${input.ledgerDir}`,
      hint: "Update or clear ledger-dir if legacy interoperability is no longer used.",
    });
  } else {
    checks.push({
      name: "ledger.legacy",
      level: "ok",
      message: `Legacy ledger interoperability configured: ${input.ledgerDir}`,
    });
  }
  return checks;
}

export const doctorCmd = new Command("doctor")
  .description(
    "Health check: verify config, SQLite integrity/content, prices, and portfolio state.",
  )
  .option("--json", "Emit JSON")
  .action((opts) => {
    const checks: Check[] = [];
    const cfg = getEffectiveConfig();

    if (!cfg.base_currency) {
      checks.push({
        name: "config.base_currency",
        level: "error",
        message: "base_currency is not set",
        hint: "finsight config set base-currency CNY",
      });
    } else {
      checks.push({
        name: "config.base_currency",
        level: "ok",
        message: `base_currency = ${cfg.base_currency}`,
      });
    }

    // Inspect the authoritative SQLite database before any writable open.
    const databasePath = getDbPath();
    const storageChecks = collectStorageHealthChecks({
      databasePath,
      ledgerDir: cfg.ledger_dir || undefined,
    });
    checks.push(...storageChecks);
    const integrityError = storageChecks.find(
      (check) => check.name === "db.integrity" && check.level === "error",
    );
    if (integrityError) {
      fail("DATA_CONFLICT", integrityError.message, {
        json: opts.json,
        hint: integrityError.hint,
      });
    }

    let databaseReadError: unknown;
    try {
      const db = getReadOnlyDb(databasePath);
      try {
        const accs = listAccounts(db, { includeInactive: true });
        const allPositions = listPositions(db);
        const allTransactions = listTransactions(db);
        const posCount = allPositions.length;
        const txCount = allTransactions.length;
        const snapCount = listSnapshots(db).length;
        const decCount = listDecisions(db).length;
        checks.push({
          name: "db.content",
          level: accs.length === 0 ? "warn" : "ok",
          message: `accounts=${accs.length} positions=${posCount} tx=${txCount} snapshots=${snapCount} decisions=${decCount}`,
          hint:
            accs.length === 0
              ? "Empty DB. Try `finsight init` to seed demo data, or `finsight account add`."
              : undefined,
        });

        const stale = allPositions.filter((p) => p.current_price === 0);
        if (stale.length > 0) {
          checks.push({
            name: "prices.stale",
            level: "warn",
            message: `${stale.length} position(s) have current_price = 0`,
            hint: "finsight quote update (refreshes from Yahoo Finance + 天天基金)",
          });
        } else if (posCount > 0) {
          checks.push({
            name: "prices.stale",
            level: "ok",
            message: "All positions have a current price.",
          });
        }

        const needsReview = allTransactions.filter((t) => t.needs_review === 1);
        if (needsReview.length > 0) {
          checks.push({
            name: "transactions.needs_review",
            level: "warn",
            message: `${needsReview.length} transaction(s) flagged needs_review = 1`,
            hint: "finsight trade list --needs-review (then `transaction confirm <id>` to clear)",
          });
        }

        const pendingRat = listTransactionsNeedingRationale(db);
        if (pendingRat.length > 0) {
          checks.push({
            name: "decisions.pending_rationale",
            level: "warn",
            message: `${pendingRat.length} buy/sell without a rationale decision`,
            hint: "finsight decision review (then `decision add --type rationale --tx <id> ...`)",
          });
        }

        const target = getActiveTarget(db);
        if (!target) {
          checks.push({
            name: "target.active",
            level: "warn",
            message: "No active target allocation set.",
            hint: "finsight target add --active --alloc ... (or skip if you don't care)",
          });
        } else {
          checks.push({
            name: "target.active",
            level: "ok",
            message: `Active target: ${target.name}`,
          });
        }
      } finally {
        db.$client.close();
      }
    } catch (error) {
      databaseReadError = error;
    }
    if (databaseReadError) {
      fail(
        "DATA_CONFLICT",
        `Cannot read the authoritative SQLite database: ${databaseReadError instanceof Error ? databaseReadError.message : String(databaseReadError)}`,
        {
          json: opts.json,
          hint: "Run a verified recovery or migration command; doctor never modifies the database.",
        },
      );
    }

    if (existsSync(databasePath)) {
      const size = statSync(databasePath).size;
      const mb = (size / 1024 / 1024).toFixed(2);
      checks.push({
        name: "db.size",
        level: "ok",
        message: `${mb} MB at ${databasePath}`,
      });
    }

    const errorCount = checks.filter((c) => c.level === "error").length;
    const warnCount = checks.filter((c) => c.level === "warn").length;

    if (opts.json) {
      emitJson({
        checks,
        summary: { ok: checks.length - errorCount - warnCount, warn: warnCount, error: errorCount },
      });
      process.exit(errorCount > 0 ? ExitCode.DATA_CONFLICT : ExitCode.OK);
    }

    console.log();
    for (const c of checks) {
      const icon =
        c.level === "ok" ? chalk.green("✓") : c.level === "warn" ? chalk.yellow("⚠") : chalk.red("✗");
      const name = chalk.dim(c.name.padEnd(34));
      console.log(`  ${icon} ${name} ${c.message}`);
      if (c.hint) console.log(chalk.dim(`    → ${c.hint}`));
    }
    console.log();
    if (errorCount > 0) {
      console.log(chalk.red(`  ${errorCount} error(s), ${warnCount} warning(s)`));
      process.exit(ExitCode.DATA_CONFLICT);
    } else if (warnCount > 0) {
      console.log(chalk.yellow(`  ${warnCount} warning(s) — not blocking`));
    } else {
      console.log(chalk.green("  All checks passed."));
    }
  });
