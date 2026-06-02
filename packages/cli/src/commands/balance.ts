import { Command } from "commander";
import { updateBalance, listAccounts } from "@finsight/core";
import { initDb } from "../utils/config.js";
import { createTable, formatCurrency, printSuccess } from "../utils/display.js";
import { emitJson, fail, ExitCode } from "../utils/exit.js";

export const balanceCmd = new Command("balance").description("Manage account balances");

function findAccountByName(db: ReturnType<typeof initDb>, name: string) {
  const accs = listAccounts(db);
  const lower = name.toLowerCase();
  return (
    accs.find((a) => a.name.toLowerCase() === lower) ??
    accs.find((a) => a.name.toLowerCase().includes(lower)) ??
    null
  );
}

balanceCmd
  .command("update")
  .description("Update account balance")
  .argument("<account>", "Account name (or partial match)")
  .argument("<amount>", "New balance amount")
  .option("--note <note>", "Update note")
  .option("--json", "Emit JSON")
  .action((accountName, amount, opts) => {
    const db = initDb();
    const acc = findAccountByName(db, accountName);
    if (!acc) {
      fail("NOT_FOUND", `Account not found: ${accountName}`, {
        json: opts.json,
        hint: "Try `finsight account list --json` to see available accounts",
      });
    }
    const parsed = Number(amount);
    if (Number.isNaN(parsed)) {
      fail("USER_ERROR", `Invalid amount: ${amount}`, { json: opts.json });
    }
    const updated = updateBalance(db, acc.id, parsed, opts.note);
    if (opts.json) {
      emitJson({ ok: true, account: updated });
      process.exit(ExitCode.OK);
    }
    printSuccess(
      `Balance updated: ${acc.name} → ${formatCurrency(parsed, acc.currency)}`,
    );
  });

balanceCmd
  .command("list")
  .description("Show all account balances")
  .option("--json", "Emit JSON")
  .action((opts) => {
    const db = initDb();
    const accs = listAccounts(db);

    if (opts.json) {
      emitJson({
        accounts: accs.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          currency: a.currency,
          institution: a.institution,
          balance: a.balance,
          tags: a.tags ? JSON.parse(a.tags) : [],
        })),
      });
      process.exit(ExitCode.OK);
    }

    if (accs.length === 0) {
      console.log("No accounts found.");
      return;
    }

    const table = createTable(["Name", "Type", "Currency", "Balance"]);
    let total = 0;
    for (const a of accs) {
      table.push([a.name, a.type, a.currency, formatCurrency(a.balance, a.currency)]);
      total += a.balance;
    }
    console.log(table.toString());
    console.log(`\n  Total (sum, ignore FX): ${formatCurrency(total)}`);
  });
