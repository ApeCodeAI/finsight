import { Command } from "commander";
import chalk from "chalk";
import { getOverview, getNetWorth, listAccounts, listSnapshots } from "@finsight/core";
import { initDb } from "../utils/config.js";
import { createTable, formatCurrency } from "../utils/display.js";
import { ExitCode, emitJson, fail } from "../utils/exit.js";

export const overviewCmd = new Command("overview")
  .description("Show asset overview")
  .option("--json", "Emit JSON to stdout (AI-friendly)")
  .action((opts) => {
    try {
      const db = initDb();
      const overview = getOverview(db);
      const netWorth = getNetWorth(db);
      const snaps = listSnapshots(db);

      if (opts.json) {
        emitJson({
          ...overview,
          by_account: netWorth.byAccount,
          snapshot_count: snaps.length,
          recent_snapshots: snaps.slice(0, 5).map((s) => ({
            id: s.id,
            date: s.snapshot_date,
            total: s.total_net_worth,
          })),
        });
        process.exit(ExitCode.OK);
      }

      // Pretty terminal output
      console.log();
      console.log(chalk.bold("  FinSight — Asset Overview"));
      console.log(chalk.dim(`  ${overview.snapshot_date}`));
      console.log();

      console.log(
        chalk.bold("  Net Worth: ") +
          chalk.yellowBright(formatCurrency(overview.total_net_worth)),
      );
      console.log();

      if (overview.accounts.length > 0) {
        console.log(chalk.bold("  Accounts"));
        const table = createTable(["Name", "Type", "Currency", "Balance (CNY)"]);
        for (const acc of overview.accounts) {
          table.push([acc.name, acc.type, acc.currency, formatCurrency(acc.balance_base)]);
        }
        console.log(table.toString());
      }

      const allocEntries = Object.entries(overview.allocation);
      if (allocEntries.length > 0) {
        console.log();
        console.log(chalk.bold("  Allocation"));
        for (const [type, pct] of allocEntries) {
          const bar = "█".repeat(Math.round(pct * 30));
          const barDim = "░".repeat(30 - Math.round(pct * 30));
          console.log(
            `    ${type.padEnd(12)} ${chalk.cyan(bar)}${chalk.dim(barDim)} ${(pct * 100).toFixed(1)}%`,
          );
        }
      }
      console.log();
    } catch (err) {
      fail("INTERNAL", String(err instanceof Error ? err.message : err), { json: opts.json });
    }
  });
