import { Command } from "commander";
import { input, select, confirm } from "@inquirer/prompts";
import {
  createAccount,
  listAccounts,
  getAccount,
  editAccount,
  archiveAccount,
  type AccountType,
} from "@finsight/core";
import { initDb } from "../utils/config.js";
import {
  createTable,
  formatCurrency,
  printSuccess,
} from "../utils/display.js";
import { emitJson, fail, ExitCode } from "../utils/exit.js";

export const accountCmd = new Command("account").description("Manage accounts");

accountCmd
  .command("add")
  .description("Add a new account (interactive)")
  .action(async () => {
    const db = initDb();
    const name = await input({ message: "Account name:" });
    const type = (await select({
      message: "Account type:",
      choices: [
        { name: "cash", value: "cash" },
        { name: "bank", value: "bank" },
        { name: "brokerage", value: "brokerage" },
        { name: "fund", value: "fund" },
        { name: "exchange", value: "exchange" },
        { name: "crypto", value: "crypto" },
        { name: "business", value: "business" },
        { name: "other", value: "other" },
      ],
    })) as AccountType;
    const institution = await input({ message: "Institution:", default: "" });
    const currency = await input({ message: "Currency:", default: "CNY" });
    const tagsStr = await input({ message: "Tags (comma-separated):", default: "" });
    const tags = tagsStr ? tagsStr.split(",").map((t: string) => t.trim()) : [];
    let balance = 0;
    if (type === "cash" || type === "bank") {
      const balStr = await input({ message: "Initial balance:", default: "0" });
      balance = parseFloat(balStr) || 0;
    }
    const notes = await input({ message: "Notes:", default: "" });
    const acc = createAccount(db, {
      name,
      type,
      currency,
      institution: institution || undefined,
      tags: tags.length > 0 ? tags : undefined,
      balance,
      notes: notes || undefined,
    });
    printSuccess(`Account created: ${acc.name} (${acc.id})`);
  });

accountCmd
  .command("list")
  .description("List all accounts")
  .option("-a, --all", "Include archived accounts")
  .option("-t, --type <type>", "Filter by type")
  .option("--json", "Emit JSON")
  .action((opts) => {
    const db = initDb();
    const filters: { type?: string; is_active?: number } = {};
    if (opts.type) filters.type = opts.type;
    if (opts.all) filters.is_active = undefined;

    const accs = listAccounts(db, Object.keys(filters).length > 0 ? filters : undefined);

    if (opts.json) {
      emitJson({
        accounts: accs.map((a) => ({
          ...a,
          tags: a.tags ? JSON.parse(a.tags) : [],
        })),
      });
      process.exit(ExitCode.OK);
    }

    if (accs.length === 0) {
      console.log("No accounts found.");
      return;
    }

    const table = createTable([
      "ID",
      "Name",
      "Type",
      "Institution",
      "Currency",
      "Balance",
      "Active",
    ]);
    for (const a of accs) {
      table.push([
        a.id.slice(-8),
        a.name,
        a.type,
        a.institution ?? "-",
        a.currency,
        formatCurrency(a.balance, a.currency),
        a.is_active ? "✓" : "✗",
      ]);
    }
    console.log(table.toString());
  });

accountCmd
  .command("show")
  .description("Show one account (full record)")
  .argument("<id>", "Account ID (or partial / name)")
  .option("--json", "Emit JSON")
  .action((idInput, opts) => {
    const db = initDb();
    const acc = findAccountByIdOrName(db, idInput);
    if (!acc) {
      fail("NOT_FOUND", `Account not found: ${idInput}`, { json: opts.json });
    }
    const payload = { ...acc, tags: acc.tags ? JSON.parse(acc.tags) : [] };
    if (opts.json) {
      emitJson(payload);
      process.exit(ExitCode.OK);
    }
    console.log(`Account ${acc.id}`);
    console.log(`  Name: ${acc.name}`);
    console.log(`  Type: ${acc.type}`);
    console.log(`  Institution: ${acc.institution ?? "-"}`);
    console.log(`  Currency: ${acc.currency}`);
    console.log(`  Balance: ${formatCurrency(acc.balance, acc.currency)}`);
    console.log(`  Tags: ${(payload.tags as string[]).join(", ") || "-"}`);
    console.log(`  Notes: ${acc.notes ?? "-"}`);
    console.log(`  Active: ${acc.is_active ? "yes" : "no"}`);
  });

accountCmd
  .command("edit")
  .description("Edit an account (interactive)")
  .argument("<id>", "Account ID (or partial / name)")
  .action(async (idInput: string) => {
    const db = initDb();
    const acc = findAccountByIdOrName(db, idInput);
    if (!acc) fail("NOT_FOUND", `Account not found: ${idInput}`);
    const name = await input({ message: "Name:", default: acc.name });
    const institution = await input({ message: "Institution:", default: acc.institution ?? "" });
    const currency = await input({ message: "Currency:", default: acc.currency });
    const notes = await input({ message: "Notes:", default: acc.notes ?? "" });
    editAccount(db, acc.id, {
      name,
      institution: institution || undefined,
      currency,
      notes: notes || undefined,
    });
    printSuccess(`Account updated: ${name}`);
  });

accountCmd
  .command("archive")
  .description("Archive an account")
  .argument("<id>", "Account ID (or partial / name)")
  .option("-y, --yes", "Skip confirmation")
  .option("--json", "Emit JSON")
  .action(async (idInput: string, opts) => {
    const db = initDb();
    const acc = findAccountByIdOrName(db, idInput);
    if (!acc) fail("NOT_FOUND", `Account not found: ${idInput}`, { json: opts.json });

    let go = opts.yes;
    if (!go) {
      go = await confirm({ message: `Archive account "${acc.name}"?` });
    }
    if (go) {
      archiveAccount(db, acc.id);
      if (opts.json) {
        emitJson({ ok: true, archived: acc.id });
        process.exit(ExitCode.OK);
      }
      printSuccess(`Account archived: ${acc.name}`);
    }
  });

function findAccountByIdOrName(db: ReturnType<typeof initDb>, input: string) {
  const exact = getAccount(db, input);
  if (exact) return exact;
  const all = listAccounts(db, { is_active: undefined } as any);
  const lower = input.toLowerCase();
  return (
    all.find((a) => a.id.endsWith(input)) ??
    all.find((a) => a.name.toLowerCase() === lower) ??
    all.find((a) => a.name.toLowerCase().includes(lower)) ??
    null
  );
}
