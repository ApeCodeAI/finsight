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
  "Legacy vault export/import interoperability (SQLite remains authoritative)",
);

export function resolveLegacyLedgerDir(
  requestedDir?: string,
  configuredDir?: string,
): string {
  const candidate = requestedDir?.trim() || configuredDir?.trim();
  if (!candidate) {
    throw new Error(
      "No legacy ledger directory specified. Pass --dir or configure ledger-dir explicitly.",
    );
  }
  return path.resolve(expandHome(candidate));
}

export function requireLegacyImportConfirmation(confirmed: boolean): void {
  if (!confirmed) {
    throw new Error(
      "Legacy ledger import is lossy and requires --yes after creating a verified SQLite backup.",
    );
  }
}

ledgerCmd
  .command("init")
  .description("Configure an optional legacy ledger export/import directory")
  .argument("<dir>", "Legacy ledger directory")
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
    printInfo("SQLite remains the sole source of truth.");
    printInfo("Use ledger commands only for explicit legacy export/import interoperability.");
  });

ledgerCmd
  .command("sync")
  .description("Legacy export: write current SQLite data to a vault ledger")
  .option("--dir <dir>", "Override legacy ledger directory (default: from config)")
  .option("--json", "Emit JSON")
  .action((opts) => {
    let root: string;
    try {
      root = resolveLegacyLedgerDir(opts.dir, getLedgerDir());
    } catch (error) {
      fail("USER_ERROR", error instanceof Error ? error.message : String(error), {
        json: opts.json,
      });
    }
    const db = initDb();
    const result = dumpDbToLedger(db, root);
    if (opts.json) {
      emitJson({ ok: true, dir: root, ...result });
      process.exit(ExitCode.OK);
    }
    printSuccess(`Exported SQLite data → legacy ledger at ${root}`);
    printInfo(`accounts: ${result.accounts}  ·  positions: ${result.positions}`);
    printInfo(
      `transactions: ${result.transactions}  ·  snapshots: ${result.snapshots}  ·  fx: ${result.fx_rates}  ·  decisions: ${result.decisions ?? 0}  ·  reconciliations: ${result.reconciliations}`,
    );
    printInfo("This lossy export is not a native backup or source of truth.");
  });

// alias: export is the legacy name for sync (kept for backwards compat with any
// scripts already calling it)
ledgerCmd
  .command("export")
  .description("Legacy export: alias for `sync`")
  .option("--dir <dir>", "Override legacy ledger directory")
  .option("--json", "Emit JSON")
  .action((opts) => {
    let root: string;
    try {
      root = resolveLegacyLedgerDir(opts.dir, getLedgerDir());
    } catch (error) {
      fail("USER_ERROR", error instanceof Error ? error.message : String(error), {
        json: opts.json,
      });
    }
    const db = initDb();
    const result = dumpDbToLedger(db, root);
    if (opts.json) {
      emitJson({ ok: true, dir: root, ...result });
      process.exit(ExitCode.OK);
    }
    printSuccess(`Exported SQLite data → legacy ledger at ${root}`);
  });

ledgerCmd
  .command("restore")
  .description("Legacy import: replace SQLite data from a ledger (LOSSY; WIPES DB)")
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
    if (!opts.yes) {
      if (!opts.json) {
        process.stderr.write(
          chalk.yellow(
            "⚠ LEGACY LOSSY IMPORT: this will WIPE the authoritative SQLite DB.\n" +
              "  Ledger files do not preserve every SQLite field or row.\n" +
              "  First run `finsight backup create` and keep the verified backup.\n",
          ),
        );
      }
      try {
        requireLegacyImportConfirmation(false);
      } catch (error) {
        fail("USER_ERROR", error instanceof Error ? error.message : String(error), {
          json: opts.json,
        });
      }
    }
    const db = initDb();
    const result = rebuildDbFromLedger(db, root);
    if (opts.json) {
      emitJson({ ok: true, dir: root, ...result });
      process.exit(ExitCode.OK);
    }
    printSuccess(`Imported legacy ledger into SQLite from ${root}`);
    printInfo(`accounts: ${result.accounts}  ·  positions: ${result.positions}`);
    printInfo(
      `transactions: ${result.transactions}  ·  snapshots: ${result.snapshots}  ·  fx: ${result.fx_rates}  ·  decisions: ${result.decisions ?? 0}  ·  reconciliations: ${result.reconciliations}`,
    );
  });

ledgerCmd
  .command("verify")
  .description("Legacy check: compare exported ledger counts with SQLite")
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
      printSuccess("Legacy export counts match SQLite.");
    } else {
      process.stderr.write(
        chalk.yellow(
          "⚠ Legacy ledger and authoritative SQLite counts differ.\n" +
            "  Export again only if you explicitly need interoperability.\n" +
            "  Never import it as canonical recovery without a verified DB backup.\n",
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
    if (!opts.dryRun && !opts.yes) {
      if (!opts.json) {
        process.stderr.write(
          chalk.yellow(
            "⚠ Destructive purge requires --yes. Run with --dry-run to preview.\n",
          ),
        );
      }
      fail("USER_ERROR", "Ledger purge requires --yes unless --dry-run is used.", {
        json: opts.json,
        hint: "Create a verified native backup before purging historical data.",
      });
    }

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
      printInfo("Run `finsight backup create` to capture a verified native backup.");
    } catch (e) {
      fail("USER_ERROR", e instanceof Error ? e.message : String(e), {
        json: opts.json,
      });
    }
  });

ledgerCmd
  .command("status")
  .description("Show optional legacy ledger interoperability configuration")
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
      console.log(chalk.dim("  Legacy interoperability only; SQLite is authoritative."));
      console.log(chalk.dim("    finsight ledger sync     — explicit SQLite → ledger export"));
      console.log(chalk.dim("    finsight ledger verify   — compare exported counts"));
      console.log(chalk.dim("    finsight ledger restore  — lossy ledger → SQLite import"));
    } else {
      console.log("  No legacy ledger configured (normal). SQLite is authoritative.");
    }
  });

function expandHome(p: string): string {
  if (p.startsWith("~/")) return path.join(process.env.HOME ?? "", p.slice(2));
  return p;
}
