import { Command } from "commander";
import chalk from "chalk";
import {
  confirmTransaction,
  listPendingReview,
  listTransactions,
} from "@finsight/core";
import { initDb } from "../utils/config.js";
import { createTable, formatCurrency, printSuccess } from "../utils/display.js";
import { emitJson, fail, ExitCode } from "../utils/exit.js";

export const transactionCmd = new Command("transaction").description(
  "Inspect, confirm and review transactions",
);

transactionCmd
  .command("review")
  .description("List transactions flagged needs_review = 1 (price was a fallback)")
  .option("--json", "Emit JSON")
  .action((opts) => {
    const db = initDb();
    const pending = listPendingReview(db);
    if (opts.json) {
      emitJson({ count: pending.length, transactions: pending });
      process.exit(ExitCode.OK);
    }
    if (pending.length === 0) {
      printSuccess("All transactions are confirmed.");
      return;
    }
    const t = createTable(["ID", "Type", "Symbol", "Qty", "Price", "Source", "Date"]);
    for (const tx of pending) {
      t.push([
        tx.id.slice(-12),
        tx.type,
        tx.position_id ? "(see position)" : "—",
        tx.quantity?.toString() ?? "—",
        tx.price ? formatCurrency(tx.price, tx.currency) : "—",
        tx.price_source ?? "—",
        tx.traded_at.slice(0, 10),
      ]);
    }
    console.log(t.toString());
    console.log();
    console.log(
      chalk.dim("Run `finsight transaction confirm <id> --price <p>` to upgrade,"),
    );
    console.log(
      chalk.dim("or `finsight transaction confirm <id>` to accept the fallback as-is."),
    );
  });

transactionCmd
  .command("confirm")
  .description("Mark a transaction reviewed (and optionally fix its price)")
  .argument("<id>", "Transaction id (or last-N suffix)")
  .option("--price <p>", "Overwrite the price with a user-provided value")
  .option("--json", "Emit JSON")
  .action((idInput, opts) => {
    const db = initDb();
    const all = listTransactions(db);
    const tx =
      all.find((t) => t.id === idInput) ?? all.find((t) => t.id.endsWith(idInput));
    if (!tx) fail("NOT_FOUND", `Transaction not found: ${idInput}`, { json: opts.json });
    const newPrice = opts.price != null ? Number(opts.price) : undefined;
    if (opts.price != null && Number.isNaN(newPrice)) {
      fail("USER_ERROR", `Invalid --price: ${opts.price}`, { json: opts.json });
    }
    const { updated } = confirmTransaction(db, tx.id, newPrice);
    if (opts.json) {
      emitJson({ ok: true, id: tx.id, updated, new_price: newPrice });
      process.exit(ExitCode.OK);
    }
    printSuccess(
      newPrice != null
        ? `Confirmed ${tx.id.slice(-12)} with new price ${formatCurrency(newPrice, tx.currency)}`
        : `Confirmed ${tx.id.slice(-12)} (kept fallback price)`,
    );
  });
