import { Command } from "commander";
import { existsSync } from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { planLiquidAssetsImport, applyLiquidAssetsImport } from "@finsight/core";
import {
  importYouzhiyouhang,
  planYzyxBatch,
  applyYzyxBatch,
} from "@finsight/connector-yzyx";
import { initDb } from "../utils/config.js";
import {
  createTable,
  formatCurrency,
  printSuccess,
  printInfo,
} from "../utils/display.js";
import { emitJson, fail, ExitCode } from "../utils/exit.js";

export const importCmd = new Command("import").description(
  "Import data from external sources",
);

importCmd
  .command("youzhiyouhang")
  .description("Import 有知有行 xlsx file")
  .argument("<file>", "Path to xlsx file")
  .option("--json", "Emit JSON")
  .action(async (file, opts) => {
    const db = initDb();
    try {
      const result = await importYouzhiyouhang(db, file);
      if (opts.json) {
        emitJson({ ok: true, ...result });
        process.exit(ExitCode.OK);
      }
      printSuccess(`Import completed for: ${result.accountName}`);
      printInfo(`Account ID: ${result.accountId.slice(-8)}`);
      printInfo(
        `Snapshots: +${result.snapshotsCreated} created, ${result.snapshotsSkipped} skipped`,
      );
      printInfo(
        `Transactions (转入转出): +${result.transactionsCreated} created, ${result.transactionsSkipped} skipped`,
      );
    } catch (e) {
      fail("INTERNAL", e instanceof Error ? e.message : String(e), {
        json: opts.json,
        hint: "Check file path and sheet structure",
      });
    }
  });

importCmd
  .command("md")
  .description("Import liquid-assets markdown (accounts + holdings + snapshot)")
  .argument("<file>", "Path to liquid-assets .md file")
  .option("--apply", "Actually write to DB (default: dry-run preview)")
  .option("--snapshot-note <note>", "Note attached to the auto-created snapshot")
  .option("--tag <tag>", "Custom tag (default: liquid-assets-2026-05-28)")
  .option("--json", "Emit JSON (preview or result)")
  .action((file, opts) => {
    const resolved = path.resolve(file);
    if (!existsSync(resolved)) {
      fail("USER_ERROR", `File not found: ${resolved}`, { json: opts.json });
    }
    const db = initDb();

    if (!opts.apply) {
      let plan;
      try {
        plan = planLiquidAssetsImport(db, resolved);
      } catch (e) {
        fail("USER_ERROR", e instanceof Error ? e.message : String(e), {
          json: opts.json,
          hint: "Ensure the file has a '## 3.' section with '| 资产名称 |' table header",
        });
      }
      if (opts.json) {
        emitJson({ mode: "plan", path: resolved, ...plan });
        process.exit(ExitCode.OK);
      }
      console.log();
      console.log(chalk.bold(`  Import plan (dry-run): ${resolved}`));
      console.log(
        chalk.dim(
          `  ${plan.accounts.length} accounts · ${plan.positions.length} positions · would create ${plan.to_create_accounts.length} new accounts (skip ${plan.to_skip_accounts.length})`,
        ),
      );

      console.log();
      console.log(chalk.bold("  Accounts"));
      const t1 = createTable([
        "Action",
        "Name",
        "Type",
        "Currency",
        "Total",
        "Cash estimate",
      ]);
      const existingSkipNames = new Set(plan.to_skip_accounts.map((s) => s.name));
      for (const a of plan.accounts) {
        const action = existingSkipNames.has(a.name)
          ? chalk.yellow("· update")
          : chalk.green("+ create");
        const cash = plan.account_cash_estimates[a.name] ?? a.total_value;
        t1.push([
          action,
          a.name,
          a.type,
          a.currency,
          formatCurrency(a.total_value, a.currency),
          formatCurrency(cash, a.currency),
        ]);
      }
      console.log(t1.toString());

      if (plan.positions.length > 0) {
        console.log();
        console.log(chalk.bold("  Positions"));
        const t2 = createTable([
          "Account",
          "Symbol",
          "Qty",
          "Cost",
          "Price",
          "Market value",
          "CCY",
        ]);
        for (const p of plan.positions) {
          t2.push([
            p.account_name,
            p.symbol +
              (p.name && p.name !== p.symbol ? chalk.dim(` ${p.name}`) : ""),
            p.quantity.toString(),
            p.avg_cost.toString(),
            p.current_price.toString(),
            formatCurrency(p.quantity * p.current_price, p.currency),
            p.currency,
          ]);
        }
        console.log(t2.toString());
      }

      console.log();
      console.log(
        chalk.bold("  FX rates used: ") +
          Object.entries(plan.fx_rates)
            .filter(([k]) => k !== "CNY")
            .map(([k, v]) => `${k}=${v}`)
            .join(", "),
      );
      console.log(
        chalk.bold("  Total CNY (sum of accounts after FX): ") +
          chalk.yellowBright(formatCurrency(plan.total_base)),
      );
      console.log();
      console.log(
        chalk.dim("  Add ") +
          chalk.cyan("--apply") +
          chalk.dim(" to write accounts + positions + snapshot."),
      );
      return;
    }

    let result;
    try {
      result = applyLiquidAssetsImport(db, resolved, {
        snapshotNote: opts.snapshotNote,
        tag: opts.tag,
      });
    } catch (e) {
      fail("INTERNAL", e instanceof Error ? e.message : String(e), {
        json: opts.json,
      });
    }

    if (opts.json) {
      emitJson({ mode: "apply", ...result });
      process.exit(ExitCode.OK);
    }

    printSuccess(
      `Accounts: ${result.created_accounts} created, ${result.updated_balances} updated, ${result.skipped_accounts} skipped`,
    );
    printInfo(`Positions created: ${result.created_positions}`);
    printInfo(`Snapshot ${result.snapshot_id.slice(-8)} captured`);
    console.log(
      chalk.bold("  Snapshot net worth: ") +
        chalk.yellowBright(formatCurrency(result.snapshot_total)),
    );
  });

importCmd
  .command("yzyx-batch")
  .description(
    "Batch import all 有知有行 xlsx in a directory (mapped to MD accounts)",
  )
  .argument("<dir>", "Directory containing 有知有行 *.xlsx files")
  .option("--apply", "Actually write to DB (default: dry-run preview)")
  .option(
    "--notes-prefix <prefix>",
    "Snapshot notes prefix",
    "yzyx-historical:",
  )
  .option("--json", "Emit JSON")
  .action(async (dir, opts) => {
    const resolved = path.resolve(dir);
    if (!existsSync(resolved)) {
      fail("USER_ERROR", `Directory not found: ${resolved}`, { json: opts.json });
    }
    const db = initDb();

    if (!opts.apply) {
      const plan = planYzyxBatch(db, resolved);
      if (opts.json) {
        emitJson({ mode: "plan", ...plan });
        process.exit(ExitCode.OK);
      }
      console.log();
      console.log(chalk.bold(`  yzyx-batch plan (dry-run): ${resolved}`));
      console.log(
        chalk.dim(`  Found ${plan.entries.length} xlsx file(s)`),
      );
      console.log();
      const t = createTable([
        "Status",
        "File",
        "Mapped to",
        "Account ID",
      ]);
      for (const e of plan.entries) {
        let status: string;
        if (!e.account_name) {
          status = chalk.red("✗ no map");
        } else if (!e.account_id) {
          status = chalk.yellow("⚠ account missing");
        } else {
          status = chalk.green("+ import");
        }
        t.push([
          status,
          e.file,
          e.account_name ?? "—",
          e.account_id ? e.account_id.slice(-8) : "—",
        ]);
      }
      console.log(t.toString());
      console.log();
      console.log(
        chalk.dim("  Add ") +
          chalk.cyan("--apply") +
          chalk.dim(" to import historical snapshots into each account."),
      );
      return;
    }

    let result;
    try {
      result = await applyYzyxBatch(db, resolved, {
        notesPrefix: opts.notesPrefix,
      });
    } catch (e) {
      fail("INTERNAL", e instanceof Error ? e.message : String(e), {
        json: opts.json,
      });
    }

    if (opts.json) {
      emitJson({ mode: "apply", ...result });
      process.exit(ExitCode.OK);
    }

    const sumBy = (key: "snapshots_created" | "snapshots_skipped" | "transactions_created" | "transactions_skipped") =>
      result.results.reduce((s, r) => s + r[key], 0);
    const errors = result.results.filter((r) => r.error);
    printSuccess(
      `Imported: ${sumBy("snapshots_created")} snapshots / ${sumBy("transactions_created")} cash-flow tx created, ` +
        `${sumBy("snapshots_skipped")} / ${sumBy("transactions_skipped")} skipped, ` +
        `${errors.length} file(s) with errors`,
    );
    const t = createTable([
      "File",
      "Account",
      "Snap +/-",
      "Tx +/-",
      "Error",
    ]);
    for (const r of result.results) {
      t.push([
        r.file,
        r.account_name ?? "—",
        `${r.snapshots_created}/${r.snapshots_skipped}`,
        `${r.transactions_created}/${r.transactions_skipped}`,
        r.error ? chalk.red(r.error) : "",
      ]);
    }
    console.log(t.toString());
  });
