import { Command } from "commander";
import chalk from "chalk";
import path from "node:path";
import { existsSync } from "node:fs";
import {
  dumpDbToLedger,
  rebuildDbFromLedger,
  verifyLedgerVsDb,
  purgeHistoricalBefore,
  listTransactions,
  listSnapshots as listSnapshotsRaw,
  readConfig,
  writeConfig,
  ensureLedgerSkeleton,
  ensureReadme,
  getLedgerDir,
} from "@finsight/core";
import { initDb } from "../utils/config.js";
import { createTable, printSuccess, printInfo } from "../utils/display.js";
import { emitJson, fail, ExitCode } from "../utils/exit.js";

export const ledgerCmd = new Command("ledger").description(
  "Daily snapshot to vault (db-first; ledger is a periodic backup)",
);

ledgerCmd
  .command("init")
  .description("Configure the ledger directory (writes ~/.finsight/config.json)")
  .argument("<dir>", "Vault ledger directory (e.g. ~/finsight-vault or ~/Documents/Obsidian Vault/finsight)")
  .option("--json", "Emit JSON")
  .action((dir, opts) => {
    const resolved = path.resolve(expandHome(dir));
    ensureLedgerSkeleton(resolved);
    ensureReadme(resolved);
    const cfg = readConfig();
    cfg.ledger_dir = resolved;
    writeConfig(cfg);
    if (opts.json) {
      emitJson({ ok: true, ledger_dir: resolved });
      process.exit(ExitCode.OK);
    }
    printSuccess(`ledger_dir configured: ${resolved}`);
    printInfo("Daily workflow:");
    printInfo("  · Run finsight commands normally (writes only to local DB).");
    printInfo("  · Once a day: `finsight ledger sync` to mirror DB → vault.");
    printInfo("  · DB lost / corrupted: `finsight ledger restore` to rebuild from vault.");
  });

ledgerCmd
  .command("sync")
  .description("Mirror current DB → vault ledger (run daily as a backup)")
  .option("--dir <dir>", "Override ledger directory (default: from config)")
  .option("--json", "Emit JSON")
  .action((opts) => {
    const root = path.resolve(expandHome(opts.dir ?? getLedgerDir() ?? ""));
    if (!root) {
      fail("USER_ERROR", "No ledger directory configured. Run `finsight ledger init <dir>` first.", {
        json: opts.json,
      });
    }
    const db = initDb();
    const result = dumpDbToLedger(db, root);
    if (opts.json) {
      emitJson({ ok: true, dir: root, ...result });
      process.exit(ExitCode.OK);
    }
    printSuccess(`Synced DB → ${root}`);
    printInfo(`accounts: ${result.accounts}  ·  positions: ${result.positions}`);
    printInfo(
      `transactions: ${result.transactions}  ·  snapshots: ${result.snapshots}  ·  fx: ${result.fx_rates}  ·  decisions: ${result.decisions ?? 0}  ·  reconciliations: ${result.reconciliations}`,
    );
    printInfo("Commit the vault changes to git when convenient.");
  });

// alias: export is the legacy name for sync (kept for backwards compat with any
// scripts already calling it)
ledgerCmd
  .command("export")
  .description("Alias for `sync` — mirror DB → vault")
  .option("--dir <dir>", "Override ledger directory")
  .option("--json", "Emit JSON")
  .action((opts) => {
    const root = path.resolve(expandHome(opts.dir ?? getLedgerDir() ?? ""));
    if (!root) {
      fail("USER_ERROR", "No ledger directory configured.", { json: opts.json });
    }
    const db = initDb();
    const result = dumpDbToLedger(db, root);
    if (opts.json) {
      emitJson({ ok: true, dir: root, ...result });
      process.exit(ExitCode.OK);
    }
    printSuccess(`Synced DB → ${root}`);
  });

ledgerCmd
  .command("restore")
  .description("Rebuild DB from vault ledger (disaster recovery; WIPES local DB)")
  .option("--yes", "Skip confirmation")
  .option("--json", "Emit JSON")
  .action((opts) => {
    const root = getLedgerDir();
    if (!root) {
      fail("USER_ERROR", "No ledger directory configured.", { json: opts.json });
    }
    if (!existsSync(root)) {
      fail("NOT_FOUND", `Ledger directory not found: ${root}`, { json: opts.json });
    }
    if (!opts.yes && !opts.json) {
      process.stderr.write(
        chalk.yellow(
          "⚠ This will WIPE the local DB and rebuild from vault.\n" +
            "  Any CLI writes made since the last `ledger sync` will be lost.\n" +
            "  Run with --yes to proceed.\n",
        ),
      );
      process.exit(ExitCode.USER_ERROR);
    }
    const db = initDb();
    const result = rebuildDbFromLedger(db, root);
    if (opts.json) {
      emitJson({ ok: true, dir: root, ...result });
      process.exit(ExitCode.OK);
    }
    printSuccess(`Restored DB from ${root}`);
    printInfo(`accounts: ${result.accounts}  ·  positions: ${result.positions}`);
    printInfo(
      `transactions: ${result.transactions}  ·  snapshots: ${result.snapshots}  ·  fx: ${result.fx_rates}  ·  decisions: ${result.decisions ?? 0}  ·  reconciliations: ${result.reconciliations}`,
    );
  });

ledgerCmd
  .command("verify")
  .description("Compare DB vs vault ledger; non-zero exit if they diverge")
  .option("--json", "Emit JSON")
  .action((opts) => {
    const root = getLedgerDir();
    if (!root) {
      fail("USER_ERROR", "No ledger directory configured.", { json: opts.json });
    }
    const db = initDb();
    const diff = verifyLedgerVsDb(db, root);
    if (opts.json) {
      emitJson(diff);
      process.exit(diff.in_sync ? ExitCode.OK : ExitCode.DATA_CONFLICT);
    }
    const table = createTable(["Entity", "Ledger", "DB", "Match"]);
    const rows: Array<[string, number, number]> = [
      ["accounts", diff.ledger_accounts, diff.db_accounts],
      ["positions", diff.ledger_positions, diff.db_positions],
      ["transactions", diff.ledger_transactions, diff.db_transactions],
      ["snapshots", diff.ledger_snapshots, diff.db_snapshots],
      ["fx_rates", diff.ledger_fx_rates, diff.db_fx_rates],
      ["reconciliations", diff.ledger_reconciliations, diff.db_reconciliations],
    ];
    for (const [name, a, b] of rows) {
      table.push([name, String(a), String(b), a === b ? chalk.green("✓") : chalk.red("✗")]);
    }
    console.log(table.toString());
    if (diff.in_sync) {
      printSuccess("DB and vault ledger are in sync.");
    } else {
      process.stderr.write(
        chalk.yellow(
          "⚠ DB and vault diverge. If DB is newer, run `finsight ledger sync`.\n" +
            "  If you manually edited vault YAML, run `finsight ledger restore --yes`.\n",
        ),
      );
      process.exit(ExitCode.DATA_CONFLICT);
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
//  purge — one-time cleanup when historical data is unreliable
// ─────────────────────────────────────────────────────────────────────────────

ledgerCmd
  .command("purge")
  .description(
    "Delete transactions + snapshots dated before <cutoff>. " +
      "Leaves accounts/positions/decisions/targets/reconciliations untouched. " +
      "Use when your historical data is wrong and you want a clean slate.",
  )
  .requiredOption("--before <YYYY-MM-DD>", "Cutoff date (exclusive)")
  .option("--yes", "Skip confirmation and apply")
  .option("--dry-run", "Show what would be deleted without changing the DB")
  .option("--json", "Emit JSON")
  .action(async (opts) => {
    const db = initDb();

    // Preview the impact first (always, before any write).
    const txnsToDelete = listTransactions(db).filter(
      (t) => t.traded_at < opts.before,
    );
    const snapsToDelete = listSnapshotsRaw(db).filter(
      (s) => s.snapshot_date < opts.before,
    );
    const preview = {
      cutoff: opts.before,
      transactions_would_delete: txnsToDelete.length,
      snapshots_would_delete: snapsToDelete.length,
    };

    if (opts.dryRun) {
      if (opts.json) {
        emitJson({ ok: true, mode: "dry-run", ...preview });
        process.exit(ExitCode.OK);
      }
      printInfo(
        `Would delete ${preview.transactions_would_delete} transactions ` +
          `and ${preview.snapshots_would_delete} snapshots (cutoff < ${preview.cutoff}).`,
      );
      printInfo("Re-run with --yes to apply.");
      process.exit(ExitCode.OK);
    }

    if (!opts.yes && !opts.json) {
      process.stderr.write(
        chalk.yellow(
          `⚠ Will delete ${preview.transactions_would_delete} transactions ` +
            `and ${preview.snapshots_would_delete} snapshots ` +
            `(traded_at / snapshot_date < ${opts.before}).\n` +
            `  Destructive, no automatic backup.\n` +
            `  Run with --yes to proceed, or --dry-run for JSON preview.\n`,
        ),
      );
      process.exit(ExitCode.USER_ERROR);
    }

    try {
      const result = purgeHistoricalBefore(db, opts.before);
      if (opts.json) {
        emitJson({ ok: true, ...result });
        process.exit(ExitCode.OK);
      }
      printSuccess(
        `Purged: ${result.transactions_deleted} transactions, ` +
          `${result.snapshots_deleted} snapshots (cutoff < ${result.cutoff})`,
      );
      printInfo("Run `finsight ledger sync` to mirror to vault.");
    } catch (e) {
      fail("USER_ERROR", e instanceof Error ? e.message : String(e), {
        json: opts.json,
      });
    }
  });

ledgerCmd
  .command("status")
  .description("Show current ledger configuration")
  .option("--json", "Emit JSON")
  .action((opts) => {
    const cfg = readConfig();
    if (opts.json) {
      emitJson({ ...cfg, configured: !!cfg.ledger_dir });
      process.exit(ExitCode.OK);
    }
    if (cfg.ledger_dir) {
      console.log(chalk.bold("  Ledger dir: ") + cfg.ledger_dir);
      console.log(
        "  Status: " +
          (existsSync(cfg.ledger_dir) ? chalk.green("exists") : chalk.red("missing")),
      );
      console.log();
      console.log(chalk.dim("  Workflow:"));
      console.log(chalk.dim("    finsight ledger sync     — daily DB → vault"));
      console.log(chalk.dim("    finsight ledger verify   — check sync state"));
      console.log(chalk.dim("    finsight ledger restore  — vault → DB (disaster recovery)"));
    } else {
      console.log("  No ledger configured. Run `finsight ledger init <dir>`.");
    }
  });

function expandHome(p: string): string {
  if (p.startsWith("~/")) return path.join(process.env.HOME ?? "", p.slice(2));
  return p;
}
