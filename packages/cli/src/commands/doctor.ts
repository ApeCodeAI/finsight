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
  getLedgerDir,
  verifyLedgerVsDb,
} from "@finsight/core";
import { initDb } from "../utils/config.js";
import { emitJson, ExitCode } from "../utils/exit.js";

type CheckLevel = "ok" | "warn" | "error";
interface Check {
  name: string;
  level: CheckLevel;
  message: string;
  hint?: string;
}

export const doctorCmd = new Command("doctor")
  .description(
    "Health check: verify config, vault, DB, prices, sync state. Run when something feels off.",
  )
  .option("--json", "Emit JSON")
  .action((opts) => {
    const checks: Check[] = [];
    const cfg = getEffectiveConfig();

    // 1. Config sanity
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

    // 2. Ledger configured + exists
    const ledgerDir = getLedgerDir();
    if (!ledgerDir) {
      checks.push({
        name: "ledger.configured",
        level: "warn",
        message: "No ledger directory configured (DB is unbacked).",
        hint: "finsight ledger init <dir>",
      });
    } else if (!existsSync(ledgerDir)) {
      checks.push({
        name: "ledger.exists",
        level: "error",
        message: `Ledger directory missing: ${ledgerDir}`,
        hint: "finsight ledger init <dir> to recreate",
      });
    } else {
      checks.push({
        name: "ledger.exists",
        level: "ok",
        message: `Ledger at ${ledgerDir}`,
      });
    }

    // 3. DB writable + has content
    const db = initDb();
    const accs = listAccounts(db, { includeInactive: true });
    const posCount = listPositions(db).length;
    const txCount = listTransactions(db).length;
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

    // 4. Sync state (DB vs vault)
    if (ledgerDir && existsSync(ledgerDir)) {
      try {
        const diff = verifyLedgerVsDb(db, ledgerDir);
        if (diff.in_sync) {
          checks.push({
            name: "ledger.sync",
            level: "ok",
            message: "DB and vault are in sync.",
          });
        } else {
          checks.push({
            name: "ledger.sync",
            level: "warn",
            message: `Out of sync: ${diff.db_accounts}/${diff.ledger_accounts} accs, ${diff.db_transactions}/${diff.ledger_transactions} tx, ${diff.db_snapshots}/${diff.ledger_snapshots} snap`,
            hint: "finsight ledger sync (or `restore --yes` if vault is newer)",
          });
        }
      } catch (e) {
        checks.push({
          name: "ledger.sync",
          level: "warn",
          message: `Couldn't verify: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }

    // 5. Stale prices: any position with current_price still at 0 or untouched
    const stale = listPositions(db).filter((p) => p.current_price === 0);
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

    // 6. needs_review transactions (price fallbacks)
    const needsReview = listTransactions(db).filter((t) => t.needs_review === 1);
    if (needsReview.length > 0) {
      checks.push({
        name: "transactions.needs_review",
        level: "warn",
        message: `${needsReview.length} transaction(s) flagged needs_review = 1`,
        hint: "finsight trade list --needs-review (then `transaction confirm <id>` to clear)",
      });
    }

    // 7. Pending rationale (buy/sell without a rationale decision)
    const pendingRat = listTransactionsNeedingRationale(db);
    if (pendingRat.length > 0) {
      checks.push({
        name: "decisions.pending_rationale",
        level: "warn",
        message: `${pendingRat.length} buy/sell without a rationale decision`,
        hint: "finsight decision review (then `decision add --type rationale --tx <id> ...`)",
      });
    }

    // 8. Active target
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

    // 9. DB file size sanity
    if (cfg.db_path && existsSync(cfg.db_path)) {
      const size = statSync(cfg.db_path).size;
      const mb = (size / 1024 / 1024).toFixed(2);
      checks.push({
        name: "db.size",
        level: "ok",
        message: `${mb} MB at ${cfg.db_path}`,
      });
    }

    // Aggregate
    const errorCount = checks.filter((c) => c.level === "error").length;
    const warnCount = checks.filter((c) => c.level === "warn").length;

    if (opts.json) {
      emitJson({
        checks,
        summary: { ok: checks.length - errorCount - warnCount, warn: warnCount, error: errorCount },
      });
      process.exit(
        errorCount > 0
          ? ExitCode.DATA_CONFLICT
          : warnCount > 0
            ? ExitCode.OK // warnings shouldn't fail scripts
            : ExitCode.OK,
      );
    }

    // Pretty print
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
