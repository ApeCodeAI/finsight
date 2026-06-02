import { Command } from "commander";
import chalk from "chalk";
import { readFileSync } from "node:fs";
import {
  createDecision,
  listDecisions,
  getDecision,
  updateDecision,
  deleteDecision,
  listTransactionsNeedingRationale,
  checkDecisionTriggers,
  type DecisionType,
  type Conviction,
  type Horizon,
} from "@finsight/core";
import { initDb } from "../utils/config.js";
import {
  createTable,
  formatCurrency,
  printSuccess,
  printInfo,
} from "../utils/display.js";
import { emitJson, fail, ExitCode } from "../utils/exit.js";

export const decisionCmd = new Command("decision").description(
  "Log and review investment decisions, theses, retrospectives, and daily notes",
);

const TYPES: DecisionType[] = [
  "rationale",
  "target",
  "stop-loss",
  "rethink",
  "retro",
  "note",
];

function readBody(opt: string | undefined): string | undefined {
  if (opt === undefined) return undefined;
  if (opt === "-") {
    return readFileSync(0, "utf8").trim(); // stdin
  }
  return opt;
}

function parseList(s?: string): string[] | undefined {
  if (!s) return undefined;
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

function validType(t: string): DecisionType {
  if (!TYPES.includes(t as DecisionType)) {
    throw new Error(`Invalid --type ${t}; must be one of: ${TYPES.join(", ")}`);
  }
  return t as DecisionType;
}

function validConviction(c?: string): Conviction | undefined {
  if (!c) return undefined;
  if (c !== "low" && c !== "medium" && c !== "high") {
    throw new Error(`Invalid --conviction ${c}; must be low|medium|high`);
  }
  return c as Conviction;
}

function validHorizon(h?: string): Horizon | undefined {
  if (!h) return undefined;
  if (!["1m", "3m", "12m", "3y"].includes(h)) {
    throw new Error(`Invalid --horizon ${h}; must be 1m|3m|12m|3y`);
  }
  return h as Horizon;
}

// ─────────────────────────────────────────────────────────────────────────────
//  add
// ─────────────────────────────────────────────────────────────────────────────

decisionCmd
  .command("add")
  .description("Record a decision or daily note")
  .option("--type <type>", `One of: ${TYPES.join(", ")}`, "note")
  .option("--title <t>", "Short title (auto-derived if omitted)")
  .option(
    "--body <text>",
    'Long-form body. Use "-" to read from stdin (e.g. cat note.md | finsight decision add --body -)',
  )
  .option("--symbol <s>", "Symbol or comma-separated list (e.g. PDD or PDD,MSFT)")
  .option("--account <a>", "Account id or comma-separated list")
  .option("--tx <id>", "Link to a transaction")
  .option("--date <YYYY-MM-DD>", "Override date (default: today)")
  .option("--conviction <c>", "low | medium | high")
  .option("--exit <p>", "Exit target price")
  .option("--stop <p>", "Stop-loss price")
  .option("--horizon <h>", "1m | 3m | 12m | 3y")
  .option("--tags <t>", "Comma-separated tags")
  .option("--json", "Emit JSON")
  .action((opts) => {
    const db = initDb();
    try {
      const d = createDecision(db, {
        date: opts.date,
        type: validType(opts.type),
        title: opts.title,
        body: readBody(opts.body),
        symbols: parseList(opts.symbol),
        accounts: parseList(opts.account),
        transaction_id: opts.tx,
        conviction: validConviction(opts.conviction),
        exit_target: opts.exit != null ? Number(opts.exit) : undefined,
        stop_loss: opts.stop != null ? Number(opts.stop) : undefined,
        horizon: validHorizon(opts.horizon),
        tags: parseList(opts.tags),
      });
      if (opts.json) {
        emitJson({ ok: true, decision: d });
        process.exit(ExitCode.OK);
      }
      printSuccess(`Decision logged: ${d.id.slice(-12)} (${d.type})`);
      printInfo(`Title: ${d.title}`);
      if (d.symbols.length) printInfo(`Symbols: ${d.symbols.join(", ")}`);
      if (d.exit_target != null) printInfo(`Exit target: ${d.exit_target}`);
      if (d.stop_loss != null) printInfo(`Stop loss: ${d.stop_loss}`);
    } catch (e) {
      fail("USER_ERROR", e instanceof Error ? e.message : String(e), { json: opts.json });
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
//  list
// ─────────────────────────────────────────────────────────────────────────────

decisionCmd
  .command("list")
  .description("List decisions, newest first")
  .option("--symbol <s>", "Filter by symbol")
  .option("--account <a>", "Filter by account")
  .option("--type <t>", `Filter by type (${TYPES.join(", ")})`)
  .option("--tag <t>", "Filter by tag")
  .option("--since <YYYY-MM-DD>", "Only entries on or after this date")
  .option("--tx <id>", "Only entries linked to this transaction")
  .option("--json", "Emit JSON")
  .action((opts) => {
    const db = initDb();
    const rows = listDecisions(db, {
      symbol: opts.symbol,
      account: opts.account,
      type: opts.type ? validType(opts.type) : undefined,
      tag: opts.tag,
      since: opts.since,
      transaction_id: opts.tx,
    });
    if (opts.json) {
      emitJson({ count: rows.length, decisions: rows });
      process.exit(ExitCode.OK);
    }
    if (rows.length === 0) {
      console.log("No decisions yet. Try `finsight decision add --help`.");
      return;
    }
    const t = createTable(["Date", "Type", "Symbols", "Conv.", "Exit", "Stop", "Title", "ID"]);
    for (const r of rows) {
      t.push([
        r.date,
        r.type,
        r.symbols.join(",") || "—",
        r.conviction ?? "—",
        r.exit_target?.toString() ?? "—",
        r.stop_loss?.toString() ?? "—",
        r.title.slice(0, 40),
        r.id.slice(-12),
      ]);
    }
    console.log(t.toString());
  });

// ─────────────────────────────────────────────────────────────────────────────
//  show
// ─────────────────────────────────────────────────────────────────────────────

decisionCmd
  .command("show")
  .description("Show one decision in full")
  .argument("<id>", "Decision id (or suffix)")
  .option("--json", "Emit JSON")
  .action((idInput, opts) => {
    const db = initDb();
    const all = listDecisions(db);
    const d =
      all.find((x) => x.id === idInput) ?? all.find((x) => x.id.endsWith(idInput));
    if (!d) fail("NOT_FOUND", `Decision not found: ${idInput}`, { json: opts.json });
    if (opts.json) {
      emitJson(d);
      process.exit(ExitCode.OK);
    }
    console.log();
    console.log(chalk.bold(`  ${d.title}`));
    console.log(chalk.dim(`  ${d.date} · ${d.type} · ${d.id}`));
    console.log();
    if (d.symbols.length) console.log(`  Symbols: ${d.symbols.join(", ")}`);
    if (d.accounts.length) console.log(`  Accounts: ${d.accounts.join(", ")}`);
    if (d.transaction_id) console.log(`  Transaction: ${d.transaction_id}`);
    if (d.conviction) console.log(`  Conviction: ${d.conviction}`);
    if (d.exit_target != null) console.log(`  Exit target: ${d.exit_target}`);
    if (d.stop_loss != null) console.log(`  Stop loss: ${d.stop_loss}`);
    if (d.horizon) console.log(`  Horizon: ${d.horizon}`);
    if (d.tags.length) console.log(`  Tags: ${d.tags.join(", ")}`);
    console.log();
    console.log(d.body || chalk.dim("(no body)"));
    console.log();
  });

// ─────────────────────────────────────────────────────────────────────────────
//  edit (replace body / fields)
// ─────────────────────────────────────────────────────────────────────────────

decisionCmd
  .command("edit")
  .description("Update fields on an existing decision")
  .argument("<id>", "Decision id (or suffix)")
  .option("--title <t>")
  .option("--body <text>", "New body (use - for stdin)")
  .option("--symbol <s>", "Replace symbols (comma-separated)")
  .option("--account <a>", "Replace accounts (comma-separated)")
  .option("--conviction <c>")
  .option("--exit <p>")
  .option("--stop <p>")
  .option("--horizon <h>")
  .option("--tags <t>")
  .option("--json", "Emit JSON")
  .action((idInput, opts) => {
    const db = initDb();
    const target = getDecision(db, idInput) ??
      listDecisions(db).find((x) => x.id.endsWith(idInput));
    if (!target) fail("NOT_FOUND", `Decision not found: ${idInput}`, { json: opts.json });
    try {
      const updated = updateDecision(db, target.id, {
        title: opts.title,
        body: readBody(opts.body),
        symbols: opts.symbol != null ? parseList(opts.symbol) : undefined,
        accounts: opts.account != null ? parseList(opts.account) : undefined,
        conviction: validConviction(opts.conviction),
        exit_target: opts.exit != null ? Number(opts.exit) : undefined,
        stop_loss: opts.stop != null ? Number(opts.stop) : undefined,
        horizon: validHorizon(opts.horizon),
        tags: opts.tags != null ? parseList(opts.tags) : undefined,
      });
      if (opts.json) {
        emitJson({ ok: true, decision: updated });
        process.exit(ExitCode.OK);
      }
      printSuccess(`Updated ${target.id.slice(-12)}`);
    } catch (e) {
      fail("USER_ERROR", e instanceof Error ? e.message : String(e), { json: opts.json });
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
//  delete
// ─────────────────────────────────────────────────────────────────────────────

decisionCmd
  .command("delete")
  .description("Delete a decision permanently")
  .argument("<id>", "Decision id (or suffix)")
  .option("--yes", "Skip confirmation")
  .option("--json", "Emit JSON")
  .action((idInput, opts) => {
    const db = initDb();
    const target = getDecision(db, idInput) ??
      listDecisions(db).find((x) => x.id.endsWith(idInput));
    if (!target) fail("NOT_FOUND", `Decision not found: ${idInput}`, { json: opts.json });
    if (!opts.yes && !opts.json) {
      process.stderr.write(
        chalk.yellow(`⚠ delete ${target.id} "${target.title}"? Run with --yes.\n`),
      );
      process.exit(ExitCode.USER_ERROR);
    }
    const { deleted } = deleteDecision(db, target.id);
    if (opts.json) {
      emitJson({ ok: deleted > 0, deleted });
      process.exit(ExitCode.OK);
    }
    printSuccess(`Deleted ${target.id.slice(-12)}`);
  });

// ─────────────────────────────────────────────────────────────────────────────
//  review — trades that still need a rationale
// ─────────────────────────────────────────────────────────────────────────────

decisionCmd
  .command("review")
  .description("List buy/sell transactions without a rationale-type decision")
  .option("--json", "Emit JSON")
  .action((opts) => {
    const db = initDb();
    const pending = listTransactionsNeedingRationale(db);
    if (opts.json) {
      emitJson({ count: pending.length, transactions: pending });
      process.exit(pending.length > 0 ? ExitCode.DATA_CONFLICT : ExitCode.OK);
    }
    if (pending.length === 0) {
      printSuccess("Every buy/sell already has a rationale recorded.");
      return;
    }
    const t = createTable(["Date", "Type", "Price", "Qty", "TX id", "Note"]);
    for (const r of pending) {
      t.push([
        r.traded_at.slice(0, 10),
        r.type,
        r.price?.toString() ?? "—",
        r.quantity?.toString() ?? "—",
        r.transaction_id.slice(-12),
        (r.notes ?? "").slice(0, 30),
      ]);
    }
    console.log(t.toString());
    console.log();
    printInfo(
      "Add a rationale: " +
        chalk.cyan(
          "finsight decision add --type rationale --symbol <S> --tx <txid> --body \"…\"",
        ),
    );
    process.exit(ExitCode.DATA_CONFLICT);
  });

// ─────────────────────────────────────────────────────────────────────────────
//  check — exit_target / stop_loss triggered
// ─────────────────────────────────────────────────────────────────────────────

decisionCmd
  .command("check")
  .description("Show decisions whose exit_target or stop_loss has been touched")
  .option("--json", "Emit JSON")
  .action((opts) => {
    const db = initDb();
    const alerts = checkDecisionTriggers(db);
    if (opts.json) {
      emitJson({ count: alerts.length, alerts });
      process.exit(alerts.some((a) => a.triggered) ? ExitCode.DATA_CONFLICT : ExitCode.OK);
    }
    if (alerts.length === 0) {
      printSuccess("No active exit_target or stop_loss decisions.");
      return;
    }
    const t = createTable(["Symbol", "Kind", "Threshold", "Now", "Triggered", "Decision"]);
    for (const a of alerts) {
      const triggeredLabel = a.triggered
        ? a.kind === "stop_loss"
          ? chalk.red("YES — STOP")
          : chalk.green("YES — TARGET")
        : chalk.dim("no");
      t.push([
        a.symbol,
        a.kind,
        a.threshold.toString(),
        a.current_price.toString(),
        triggeredLabel,
        a.decision_id.slice(-12),
      ]);
    }
    console.log(t.toString());
    if (alerts.some((a) => a.triggered)) {
      process.exit(ExitCode.DATA_CONFLICT);
    }
  });

// suppress unused
void formatCurrency;
