import { Command } from "commander";
import chalk from "chalk";
import { input } from "@inquirer/prompts";
import {
  listAccounts,
  listPositions,
  getNetWorth,
  toBase,
  recordReconciliation,
  listReconciliations,
} from "@finsight/core";
import { initDb } from "../utils/config.js";
import { createTable, formatCurrency, printSuccess, printInfo } from "../utils/display.js";
import { emitJson, fail, ExitCode } from "../utils/exit.js";

export const reconcileCmd = new Command("reconcile")
  .description("Compare FinSight's computed total against your broker app. Logs the delta.")
  .argument("<account>", "Account name (or partial match)")
  .option("--broker-total <amount>", "Broker-reported total (non-interactive)")
  .option("--note <note>", "Optional note for the reconciliation log")
  .option("--json", "Emit JSON")
  .action(async (accountName: string, opts) => {
    const db = initDb();
    const accs = listAccounts(db);
    const lower = accountName.toLowerCase();
    const acc =
      accs.find((a) => a.name.toLowerCase() === lower) ??
      accs.find((a) => a.name.toLowerCase().includes(lower));
    if (!acc) fail("NOT_FOUND", `Account not found: ${accountName}`, { json: opts.json });

    // Compute account total in account currency
    const accPositions = listPositions(db, acc.id);
    const positionsNative = accPositions.reduce(
      (s, p) => s + p.current_price * p.quantity,
      0,
    );
    const computedNative = acc.balance + positionsNative;
    const nw = getNetWorth(db);
    const slice = nw.byAccount.find((a) => a.id === acc.id);
    const computedBase = slice?.balance_base ?? toBase(db, computedNative, acc.currency);

    // Get broker_total
    let brokerTotal: number;
    if (opts.brokerTotal) {
      brokerTotal = Number(opts.brokerTotal);
      if (Number.isNaN(brokerTotal))
        fail("USER_ERROR", `Invalid --broker-total: ${opts.brokerTotal}`, { json: opts.json });
    } else if (opts.json) {
      fail("USER_ERROR", "--broker-total required in --json mode", { json: true });
    } else {
      console.log();
      console.log(chalk.bold(`  Reconcile · ${acc.name}`));
      console.log(
        chalk.dim(
          `  FinSight computed: ${formatCurrency(computedNative, acc.currency)} (${acc.currency})`,
        ),
      );
      console.log();
      const raw = await input({
        message: `Total shown in your broker (${acc.currency}):`,
      });
      brokerTotal = Number(raw);
      if (Number.isNaN(brokerTotal))
        fail("USER_ERROR", `Invalid amount: ${raw}`, { json: opts.json });
    }

    const delta = brokerTotal - computedNative;
    const pct = computedNative !== 0 ? delta / computedNative : 0;

    const row = recordReconciliation(db, {
      account_id: acc.id,
      currency: acc.currency,
      computed_total: computedNative,
      broker_total: brokerTotal,
      notes: opts.note,
    });

    if (opts.json) {
      emitJson({
        ok: true,
        reconciliation: row,
        account: acc.name,
        currency: acc.currency,
        delta_pct: pct,
        computed_total_base: computedBase,
        positions_with_fallback_price: accPositions.filter((p) => p.current_price === 0)
          .length,
      });
      process.exit(ExitCode.OK);
    }

    const t = createTable(["", "Amount"]);
    t.push(["Broker shows", formatCurrency(brokerTotal, acc.currency)]);
    t.push(["FinSight computed", formatCurrency(computedNative, acc.currency)]);
    const color = Math.abs(pct) < 0.01 ? chalk.green : Math.abs(pct) < 0.05 ? chalk.yellow : chalk.red;
    t.push([
      "Δ",
      color(
        `${delta >= 0 ? "+" : ""}${formatCurrency(delta, acc.currency)} (${(pct * 100).toFixed(2)}%)`,
      ),
    ]);
    console.log(t.toString());
    console.log();
    if (Math.abs(pct) < 0.01) {
      printSuccess("Within 1% — accounts reconcile cleanly.");
    } else if (Math.abs(pct) < 0.05) {
      printInfo(
        "Delta is 1–5%. Likely intraday drift or FX timing. Logged for review.",
      );
    } else {
      printInfo(
        chalk.red("Delta > 5%. Investigate fallback-price transactions:"),
      );
      printInfo(
        chalk.dim("  finsight trade list --account ") +
          chalk.cyan(acc.name) +
          chalk.dim(" --needs-review"),
      );
    }
  });

reconcileCmd
  .command("log")
  .description("Show past reconciliations")
  .option("--account <name>", "Filter by account")
  .option("--json", "Emit JSON")
  .action((opts) => {
    const db = initDb();
    let accountId: string | undefined;
    if (opts.account) {
      const accs = listAccounts(db);
      const acc =
        accs.find((a) => a.name.toLowerCase() === opts.account.toLowerCase()) ??
        accs.find((a) => a.name.toLowerCase().includes(opts.account.toLowerCase()));
      if (!acc) fail("NOT_FOUND", `Account not found: ${opts.account}`, { json: opts.json });
      accountId = acc.id;
    }
    const rows = listReconciliations(db, accountId);
    if (opts.json) {
      emitJson({ count: rows.length, reconciliations: rows });
      process.exit(ExitCode.OK);
    }
    if (rows.length === 0) {
      console.log("No reconciliations logged yet.");
      return;
    }
    const t = createTable(["Date", "Account", "Currency", "Broker", "FinSight", "Δ", "Note"]);
    const accs = listAccounts(db);
    const nameById = new Map(accs.map((a) => [a.id, a.name]));
    for (const r of rows) {
      const pct = r.computed_total !== 0 ? r.delta / r.computed_total : 0;
      const color = Math.abs(pct) < 0.01 ? chalk.green : Math.abs(pct) < 0.05 ? chalk.yellow : chalk.red;
      t.push([
        r.reconciled_at,
        nameById.get(r.account_id) ?? r.account_id,
        r.currency,
        formatCurrency(r.broker_total, r.currency),
        formatCurrency(r.computed_total, r.currency),
        color(`${r.delta >= 0 ? "+" : ""}${(pct * 100).toFixed(2)}%`),
        (r.notes ?? "").slice(0, 30),
      ]);
    }
    console.log(t.toString());
  });
