import { Command } from "commander";
import chalk from "chalk";
import { confirm } from "@inquirer/prompts";
import {
  recordBuy,
  recordSell,
  recordTransfer,
  recordDeposit,
  recordWithdraw,
  listTransactions,
  listAccounts,
  createDecision,
  type PriceSource,
  type Conviction,
  type Horizon,
} from "@finsight/core";
import {
  fetchQuote,
  fetchHistoricalQuote,
} from "@finsight/connector-yfinance";
import { fetchFundNav, fetchFundNavAt } from "@finsight/connector-tiantian";
import { initDb } from "../utils/config.js";
import { createTable, formatCurrency, printSuccess, printInfo } from "../utils/display.js";
import { emitJson, fail, ExitCode } from "../utils/exit.js";

export const tradeCmd = new Command("trade").description("Record and list trades");

function findAccountByName(db: ReturnType<typeof initDb>, name: string) {
  const accs = listAccounts(db);
  const lower = name.toLowerCase();
  return (
    accs.find((a) => a.name.toLowerCase() === lower) ??
    accs.find((a) => a.name.toLowerCase().includes(lower)) ??
    null
  );
}

function isFundCode(s: string): boolean {
  return /^\d{6}$/.test(s);
}

const DEFAULT_DEVIATION_THRESHOLD = 0.10; // 10%

interface ResolvePriceArgs {
  symbol: string;
  date?: string; // YYYY-MM-DD for historical
  userPrice?: number;
  hint?: "crypto" | "fx";
}

interface ResolvedPrice {
  price: number;
  source: PriceSource;
  currency: string;
  quote_fetched_at: string;
  needs_review: 0 | 1;
  /** Market reference price for deviation check; may equal price. */
  reference?: number;
  reference_source?: "today" | `historical:${string}`;
}

/**
 * Stocks: user --price wins, otherwise fall back to end-of-day close.
 * The fetched close is also returned as `reference` so the caller can warn
 * about big deviations.
 */
async function resolveStockPrice(a: ResolvePriceArgs): Promise<
  | { ok: true; resolved: ResolvedPrice }
  | { ok: false; reason: string }
> {
  const fetchedAt = new Date().toISOString();
  const r = a.date
    ? await fetchHistoricalQuote(a.symbol, a.date, a.hint)
    : await fetchQuote(a.symbol, a.hint);
  if (r.status !== "ok") {
    if (a.userPrice == null) {
      return {
        ok: false,
        reason: `No quote and no --price for ${a.symbol}: ${"reason" in r ? r.reason : "unknown"}`,
      };
    }
    // User price + no quote — accept but flag.
    return {
      ok: true,
      resolved: {
        price: a.userPrice,
        source: "user_provided",
        currency: "USD",
        quote_fetched_at: fetchedAt,
        needs_review: 0,
      },
    };
  }
  const refSource: ResolvedPrice["reference_source"] = a.date
    ? `historical:${a.date}`
    : "today";
  if (a.userPrice != null) {
    return {
      ok: true,
      resolved: {
        price: a.userPrice,
        source: "user_provided",
        currency: r.currency,
        quote_fetched_at: fetchedAt,
        needs_review: 0,
        reference: r.price,
        reference_source: refSource,
      },
    };
  }
  return {
    ok: true,
    resolved: {
      price: r.price,
      source: "eod_close",
      currency: r.currency,
      quote_fetched_at: fetchedAt,
      needs_review: 1,
      reference: r.price,
      reference_source: refSource,
    },
  };
}

/**
 * Funds: always use the official NAV. User --price is ignored with a warning.
 */
async function resolveFundPrice(a: ResolvePriceArgs): Promise<
  | { ok: true; resolved: ResolvedPrice; user_price_ignored?: boolean }
  | { ok: false; reason: string }
> {
  const fetchedAt = new Date().toISOString();
  const r = a.date
    ? await fetchFundNavAt(a.symbol, a.date)
    : await fetchFundNav(a.symbol);
  if (r.status !== "ok") {
    return { ok: false, reason: r.reason };
  }
  return {
    ok: true,
    user_price_ignored: a.userPrice != null,
    resolved: {
      price: r.quote.current_price,
      source: r.quote.source === "estimated" ? "realtime_quote" : "eod_nav",
      currency: "CNY",
      quote_fetched_at: fetchedAt,
      needs_review: 0,
    },
  };
}

interface BuyOpts {
  fee?: string;
  note?: string;
  braindumpId?: string;
  price?: string;
  amount?: string;
  date?: string;
  noQuote?: boolean;
  noWarn?: boolean;
  yes?: boolean;
  json?: boolean;
  // Decision integration
  rationale?: string;
  conviction?: Conviction;
  exit?: string;
  stop?: string;
  horizon?: Horizon;
}

function maybeAttachRationale(
  db: ReturnType<typeof initDb>,
  tx: { id: string; account_id: string; type: "buy" | "sell" },
  symbol: string,
  opts: BuyOpts,
): { decision_id: string; title: string } | null {
  const hasAnything =
    opts.rationale ||
    opts.conviction ||
    opts.exit != null ||
    opts.stop != null ||
    opts.horizon;
  if (!hasAnything) return null;
  const decision = createDecision(db, {
    type: "rationale",
    title: `${tx.type === "buy" ? "Buy" : "Sell"} ${symbol}`,
    body: opts.rationale ?? "",
    symbols: [symbol],
    accounts: [tx.account_id],
    transaction_id: tx.id,
    conviction: opts.conviction,
    exit_target: opts.exit != null ? Number(opts.exit) : undefined,
    stop_loss: opts.stop != null ? Number(opts.stop) : undefined,
    horizon: opts.horizon,
  });
  return { decision_id: decision.id, title: decision.title };
}

async function checkDeviationOk(
  resolved: ResolvedPrice,
  opts: BuyOpts,
  symbol: string,
): Promise<boolean> {
  if (resolved.source !== "user_provided") return true;
  if (!resolved.reference) return true;
  if (opts.noWarn) return true;
  const diff = Math.abs(resolved.price - resolved.reference);
  const pct = diff / resolved.reference;
  if (pct < DEFAULT_DEVIATION_THRESHOLD) return true;
  const refLabel = resolved.reference_source ?? "market";
  const msg = `⚠ ${symbol} @ ${resolved.price.toFixed(4)} differs from ${refLabel} ${resolved.reference.toFixed(4)} (${(pct * 100).toFixed(1)}%)`;
  if (opts.yes || opts.json) {
    process.stderr.write(chalk.yellow(`${msg}\n`));
    return true;
  }
  process.stderr.write(chalk.yellow(`${msg}\n`));
  return await confirm({ message: "Continue?", default: false });
}

// ─────────────────────────────────────────────────────────────────────────────
//  buy
// ─────────────────────────────────────────────────────────────────────────────

tradeCmd
  .command("buy")
  .description(
    "Record a buy. Funds: --amount mandatory, NAV auto-fetched. Stocks: --price wins, else today's close.",
  )
  .argument("<account>", "Account name (or partial match)")
  .argument("<symbol>", "Symbol / ticker")
  .argument("[quantity]", "Quantity (stocks: shares; funds: ignored, use --amount)")
  .option("--amount <a>", "Trade amount; for funds, qty = amount / NAV")
  .option("--price <p>", "Explicit unit price (stocks only; funds always use NAV)")
  .option("--date <YYYY-MM-DD>", "Historical trade date — fetches the close/NAV on that day")
  .option("--fee <fee>", "Transaction fee", "0")
  .option("--note <note>", "Trade note")
  .option("--braindump-id <id>", "Braindump note ID")
  .option("--no-quote", "Skip market lookup; require explicit --price")
  .option("--no-warn", "Skip the deviation warning when --price differs from market")
  .option("--yes", "Auto-confirm deviation warnings (non-interactive)")
  .option("--json", "Emit JSON")
  // Decision integration
  .option("--rationale <text>", "Why am I making this trade? (creates a linked decision)")
  .option("--conviction <c>", "low | medium | high")
  .option("--exit <p>", "Exit target price")
  .option("--stop <p>", "Stop-loss price")
  .option("--horizon <h>", "Expected holding period: 1m | 3m | 12m | 3y")
  .action(async (accountName, symbol, quantity, opts: BuyOpts) => {
    const db = initDb();
    const acc = findAccountByName(db, accountName);
    if (!acc) fail("NOT_FOUND", `Account not found: ${accountName}`, { json: opts.json });

    const isFund = isFundCode(symbol);

    // ── Resolve price ──────────────────────────────────────────────────────
    const userPrice = opts.price != null ? Number(opts.price) : undefined;
    if (opts.price != null && Number.isNaN(userPrice)) {
      fail("USER_ERROR", `Invalid --price: ${opts.price}`, { json: opts.json });
    }

    let resolved: ResolvedPrice;
    let userPriceIgnored = false;
    if (opts.noQuote) {
      if (userPrice == null) {
        fail("USER_ERROR", "--no-quote requires --price", { json: opts.json });
      }
      resolved = {
        price: userPrice,
        source: "user_provided",
        currency: acc.currency,
        quote_fetched_at: new Date().toISOString(),
        needs_review: 0,
      };
    } else if (isFund) {
      const out = await resolveFundPrice({ symbol, date: opts.date, userPrice });
      if (!out.ok) {
        fail("INTERNAL", `Could not fetch NAV: ${out.reason}`, {
          json: opts.json,
          hint: "Add --no-quote --price <p> to bypass",
        });
      }
      resolved = out.resolved;
      userPriceIgnored = !!out.user_price_ignored;
    } else {
      const hint =
        acc.currency === "USDT" || acc.currency === "BTC" ? ("crypto" as const) : undefined;
      const out = await resolveStockPrice({
        symbol,
        date: opts.date,
        userPrice,
        hint,
      });
      if (!out.ok) {
        fail("INTERNAL", out.reason, {
          json: opts.json,
          hint: "Add --no-quote --price <p> to bypass",
        });
      }
      resolved = out.resolved;
    }

    // ── Resolve quantity / amount ──────────────────────────────────────────
    let qty: number;
    if (isFund) {
      if (!opts.amount) {
        fail("USER_ERROR", "Funds require --amount (RMB invested)", {
          json: opts.json,
        });
      }
      const a = Number(opts.amount);
      if (Number.isNaN(a) || a <= 0) {
        fail("USER_ERROR", `Invalid --amount: ${opts.amount}`, { json: opts.json });
      }
      qty = a / resolved.price;
    } else {
      if (opts.amount) {
        const a = Number(opts.amount);
        if (Number.isNaN(a) || a <= 0) {
          fail("USER_ERROR", `Invalid --amount: ${opts.amount}`, { json: opts.json });
        }
        qty = a / resolved.price;
      } else {
        if (quantity == null) {
          fail("USER_ERROR", "Provide a quantity or --amount", { json: opts.json });
        }
        qty = Number(quantity);
        if (Number.isNaN(qty) || qty <= 0) {
          fail("USER_ERROR", `Invalid quantity: ${quantity}`, { json: opts.json });
        }
      }
    }

    // ── Deviation check (stocks with user --price) ─────────────────────────
    const proceed = await checkDeviationOk(resolved, opts, symbol);
    if (!proceed) {
      if (opts.json) {
        emitJson({ ok: false, reason: "user_cancelled_deviation" });
        process.exit(ExitCode.USER_ERROR);
      }
      process.stderr.write(chalk.dim("aborted.\n"));
      process.exit(ExitCode.USER_ERROR);
    }

    const fee = Number(opts.fee ?? "0");
    const tradedAt = opts.date ?? new Date().toISOString();

    const tx = recordBuy(db, {
      account_id: acc.id,
      symbol,
      quantity: qty,
      price: resolved.price,
      fee,
      currency: resolved.currency,
      notes: opts.note,
      traded_at: tradedAt,
      price_source: resolved.source,
      quote_fetched_at: resolved.quote_fetched_at,
      needs_review: resolved.needs_review,
    } as never);

    const decisionLink = maybeAttachRationale(
      db,
      { id: tx.id, account_id: acc.id, type: "buy" },
      symbol,
      opts,
    );

    if (opts.json) {
      emitJson({
        ok: true,
        transaction: tx,
        resolved,
        derived_quantity: qty,
        user_price_ignored: userPriceIgnored,
        decision_id: decisionLink?.decision_id ?? null,
      });
      process.exit(ExitCode.OK);
    }
    if (userPriceIgnored) {
      process.stderr.write(
        chalk.yellow(
          "⚠ --price ignored for funds (NAV is the only valid cost). Use --no-quote to bypass.\n",
        ),
      );
    }
    printSuccess(
      `Bought ${qty.toFixed(4)} ${symbol} @ ${formatCurrency(resolved.price, resolved.currency)} in ${acc.name}`,
    );
    printInfo(`Total: ${formatCurrency(qty * resolved.price, resolved.currency)} + fee ${formatCurrency(fee, resolved.currency)}`);
    printInfo(`Source: ${sourceLabel(resolved.source)}${resolved.needs_review ? chalk.yellow(" (needs review)") : ""}`);
    if (decisionLink) {
      printInfo(`Decision: ${decisionLink.decision_id.slice(-12)} (${decisionLink.title})`);
    } else if (!opts.json) {
      console.log(
        chalk.dim(
          "  No rationale recorded. " +
            chalk.cyan("finsight decision review") +
            chalk.dim(" to add one later."),
        ),
      );
    }
    console.log(chalk.dim(`  tx id: ${tx.id.slice(-12)}`));
  });

// ─────────────────────────────────────────────────────────────────────────────
//  sell
// ─────────────────────────────────────────────────────────────────────────────

tradeCmd
  .command("sell")
  .description(
    "Record a sell. Funds: --amount mandatory, NAV auto-fetched. Stocks: --price wins, else today's close.",
  )
  .argument("<account>", "Account name")
  .argument("<symbol>", "Symbol / ticker")
  .argument("[quantity]", "Quantity (stocks: shares; funds: ignored, use --amount)")
  .option("--amount <a>", "Trade amount; for funds, qty = amount / NAV")
  .option("--price <p>", "Explicit unit price (stocks only)")
  .option("--date <YYYY-MM-DD>", "Historical trade date")
  .option("--fee <fee>", "Transaction fee", "0")
  .option("--note <note>", "Trade note")
  .option("--braindump-id <id>", "Braindump note ID")
  .option("--no-quote", "Skip market lookup; require explicit --price")
  .option("--no-warn", "Skip the deviation warning")
  .option("--yes", "Auto-confirm deviation warnings")
  .option("--json", "Emit JSON")
  // Decision integration (same flags as `buy`)
  .option("--rationale <text>", "Why this sell? (creates a linked decision)")
  .option("--conviction <c>", "low | medium | high")
  .option("--exit <p>", "Future re-entry target")
  .option("--stop <p>", "Stop trigger")
  .option("--horizon <h>", "1m | 3m | 12m | 3y")
  .action(async (accountName, symbol, quantity, opts: BuyOpts) => {
    const db = initDb();
    const acc = findAccountByName(db, accountName);
    if (!acc) fail("NOT_FOUND", `Account not found: ${accountName}`, { json: opts.json });

    const isFund = isFundCode(symbol);
    const userPrice = opts.price != null ? Number(opts.price) : undefined;
    if (opts.price != null && Number.isNaN(userPrice)) {
      fail("USER_ERROR", `Invalid --price: ${opts.price}`, { json: opts.json });
    }

    let resolved: ResolvedPrice;
    let userPriceIgnored = false;
    if (opts.noQuote) {
      if (userPrice == null) {
        fail("USER_ERROR", "--no-quote requires --price", { json: opts.json });
      }
      resolved = {
        price: userPrice,
        source: "user_provided",
        currency: acc.currency,
        quote_fetched_at: new Date().toISOString(),
        needs_review: 0,
      };
    } else if (isFund) {
      const out = await resolveFundPrice({ symbol, date: opts.date, userPrice });
      if (!out.ok)
        fail("INTERNAL", `Could not fetch NAV: ${out.reason}`, { json: opts.json });
      resolved = out.resolved;
      userPriceIgnored = !!out.user_price_ignored;
    } else {
      const hint =
        acc.currency === "USDT" || acc.currency === "BTC" ? ("crypto" as const) : undefined;
      const out = await resolveStockPrice({ symbol, date: opts.date, userPrice, hint });
      if (!out.ok) fail("INTERNAL", out.reason, { json: opts.json });
      resolved = out.resolved;
    }

    let qty: number;
    if (isFund) {
      if (!opts.amount) fail("USER_ERROR", "Funds require --amount", { json: opts.json });
      const a = Number(opts.amount);
      if (Number.isNaN(a) || a <= 0)
        fail("USER_ERROR", `Invalid --amount: ${opts.amount}`, { json: opts.json });
      qty = a / resolved.price;
    } else {
      if (opts.amount) {
        const a = Number(opts.amount);
        if (Number.isNaN(a) || a <= 0)
          fail("USER_ERROR", `Invalid --amount: ${opts.amount}`, { json: opts.json });
        qty = a / resolved.price;
      } else {
        if (quantity == null)
          fail("USER_ERROR", "Provide a quantity or --amount", { json: opts.json });
        qty = Number(quantity);
        if (Number.isNaN(qty) || qty <= 0)
          fail("USER_ERROR", `Invalid quantity: ${quantity}`, { json: opts.json });
      }
    }

    const proceed = await checkDeviationOk(resolved, opts, symbol);
    if (!proceed) {
      if (opts.json) {
        emitJson({ ok: false, reason: "user_cancelled_deviation" });
        process.exit(ExitCode.USER_ERROR);
      }
      process.exit(ExitCode.USER_ERROR);
    }

    const fee = Number(opts.fee ?? "0");
    const tradedAt = opts.date ?? new Date().toISOString();

    try {
      const tx = recordSell(db, {
        account_id: acc.id,
        symbol,
        quantity: qty,
        price: resolved.price,
        fee,
        currency: resolved.currency,
        notes: opts.note,
        traded_at: tradedAt,
        price_source: resolved.source,
        quote_fetched_at: resolved.quote_fetched_at,
        needs_review: resolved.needs_review,
      } as never);
      const decisionLink = maybeAttachRationale(
        db,
        { id: tx.id, account_id: acc.id, type: "sell" },
        symbol,
        opts,
      );
      if (opts.json) {
        emitJson({
          ok: true,
          transaction: tx,
          resolved,
          derived_quantity: qty,
          user_price_ignored: userPriceIgnored,
          decision_id: decisionLink?.decision_id ?? null,
        });
        process.exit(ExitCode.OK);
      }
      if (userPriceIgnored) {
        process.stderr.write(chalk.yellow("⚠ --price ignored for funds (NAV-only).\n"));
      }
      printSuccess(
        `Sold ${qty.toFixed(4)} ${symbol} @ ${formatCurrency(resolved.price, resolved.currency)} in ${acc.name}`,
      );
      printInfo(`Source: ${sourceLabel(resolved.source)}${resolved.needs_review ? chalk.yellow(" (needs review)") : ""}`);
      if (decisionLink) {
        printInfo(`Decision: ${decisionLink.decision_id.slice(-12)} (${decisionLink.title})`);
      }
      console.log(chalk.dim(`  tx id: ${tx.id.slice(-12)}`));
    } catch (e) {
      fail("DATA_CONFLICT", e instanceof Error ? e.message : String(e), { json: opts.json });
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
//  transfer + list (unchanged from previous behavior)
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
//  deposit — external money flowing INTO an account (salary, gift, bonus...)
// ─────────────────────────────────────────────────────────────────────────────

tradeCmd
  .command("deposit")
  .description(
    "Record external money entering an account (salary, gift, bonus, refund)",
  )
  .argument("<account>", "Account name (or partial match)")
  .argument("<amount>", "Positive amount in account currency")
  .option("--date <YYYY-MM-DD>", "Trade date (defaults to today)")
  .option("--note <note>", "Source / description (e.g. '2026-05 salary')")
  .option("--json", "Emit JSON")
  .action((accountName, amountStr, opts) => {
    const db = initDb();
    const acc = findAccountByName(db, accountName);
    if (!acc)
      fail("NOT_FOUND", `Account not found: ${accountName}`, {
        json: opts.json,
      });
    const amount = Number(amountStr);
    if (Number.isNaN(amount) || amount <= 0)
      fail(
        "USER_ERROR",
        `Invalid amount: ${amountStr} (must be a positive number)`,
        { json: opts.json },
      );
    try {
      const row = recordDeposit(db, {
        account_id: acc.id,
        amount,
        traded_at: opts.date,
        note: opts.note,
      });
      if (opts.json) {
        emitJson({ ok: true, transaction: row });
        process.exit(ExitCode.OK);
      }
      printSuccess(
        `Deposit recorded: ${formatCurrency(amount, acc.currency)} → ${acc.name}`,
      );
      if (opts.note) printInfo(`  note: ${opts.note}`);
    } catch (e) {
      fail("USER_ERROR", e instanceof Error ? e.message : String(e), {
        json: opts.json,
      });
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
//  withdraw — money leaving an account to outside the FinSight universe
//             (consumption, rent, tax, anything you don't track elsewhere)
// ─────────────────────────────────────────────────────────────────────────────

tradeCmd
  .command("withdraw")
  .description(
    "Record money leaving an account to outside (consumption, rent, tax)",
  )
  .argument("<account>", "Account name (or partial match)")
  .argument("<amount>", "Positive amount in account currency")
  .option("--date <YYYY-MM-DD>", "Trade date (defaults to today)")
  .option("--note <note>", "Purpose / description")
  .option("--json", "Emit JSON")
  .action((accountName, amountStr, opts) => {
    const db = initDb();
    const acc = findAccountByName(db, accountName);
    if (!acc)
      fail("NOT_FOUND", `Account not found: ${accountName}`, {
        json: opts.json,
      });
    const amount = Number(amountStr);
    if (Number.isNaN(amount) || amount <= 0)
      fail(
        "USER_ERROR",
        `Invalid amount: ${amountStr} (must be a positive number)`,
        { json: opts.json },
      );
    try {
      const row = recordWithdraw(db, {
        account_id: acc.id,
        amount,
        traded_at: opts.date,
        note: opts.note,
      });
      if (opts.json) {
        emitJson({ ok: true, transaction: row });
        process.exit(ExitCode.OK);
      }
      printSuccess(
        `Withdraw recorded: ${formatCurrency(amount, acc.currency)} ← ${acc.name}`,
      );
      if (opts.note) printInfo(`  note: ${opts.note}`);
    } catch (e) {
      fail("USER_ERROR", e instanceof Error ? e.message : String(e), {
        json: opts.json,
      });
    }
  });

tradeCmd
  .command("transfer")
  .description("Transfer between accounts")
  .argument("<from>", "Source account name")
  .argument("<to>", "Destination account name")
  .argument("<amount>", "Amount to transfer")
  .option("--note <note>", "Transfer note")
  .option("--json", "Emit JSON")
  .action((fromName, toName, amount, opts) => {
    const db = initDb();
    const fromAcc = findAccountByName(db, fromName);
    const toAcc = findAccountByName(db, toName);
    if (!fromAcc) fail("NOT_FOUND", `Source account not found: ${fromName}`, { json: opts.json });
    if (!toAcc) fail("NOT_FOUND", `Destination account not found: ${toName}`, { json: opts.json });
    const a = Number(amount);
    if (Number.isNaN(a)) fail("USER_ERROR", `Invalid amount: ${amount}`, { json: opts.json });
    recordTransfer(db, fromAcc.id, toAcc.id, a, opts.note);
    if (opts.json) {
      emitJson({ ok: true, from: fromAcc.id, to: toAcc.id, amount: a });
      process.exit(ExitCode.OK);
    }
    printSuccess(`Transferred ${formatCurrency(a)} from ${fromAcc.name} → ${toAcc.name}`);
  });

tradeCmd
  .command("list")
  .description("List transactions")
  .option("--account <name>", "Filter by account name")
  .option("--type <type>", "Filter by type")
  .option("--from <date>", "From date (YYYY-MM-DD)")
  .option("--to <date>", "To date (YYYY-MM-DD)")
  .option("--needs-review", "Only show transactions flagged needs_review = 1")
  .option("--json", "Emit JSON")
  .action((opts) => {
    const db = initDb();
    type Filters = Parameters<typeof listTransactions>[1];
    const filters: NonNullable<Filters> = {};
    if (opts.account) {
      const acc = findAccountByName(db, opts.account);
      if (!acc) fail("NOT_FOUND", `Account not found: ${opts.account}`, { json: opts.json });
      filters.account_id = acc.id;
    }
    // type cast: schema is permissive (text), we trust the user here
    if (opts.type) filters.type = opts.type as NonNullable<typeof filters.type>;
    if (opts.from) filters.from = opts.from;
    if (opts.to) filters.to = opts.to;
    let txs = listTransactions(db, Object.keys(filters).length > 0 ? filters : undefined);
    if (opts.needsReview) txs = txs.filter((t) => t.needs_review === 1);

    if (opts.json) {
      emitJson({ transactions: txs });
      process.exit(ExitCode.OK);
    }
    if (txs.length === 0) {
      console.log("No transactions found.");
      return;
    }
    const table = createTable([
      "ID",
      "Type",
      "Amount",
      "Qty",
      "Price",
      "Source",
      "Fee",
      "Date",
      "Notes",
    ]);
    for (const tx of txs) {
      table.push([
        tx.id.slice(-8),
        tx.type,
        formatCurrency(tx.amount, tx.currency),
        tx.quantity?.toString() ?? "-",
        tx.price ? formatCurrency(tx.price, tx.currency) : "-",
        priceSourceShort(tx.price_source) + (tx.needs_review ? chalk.yellow("*") : ""),
        formatCurrency(tx.fee, tx.currency),
        tx.traded_at.slice(0, 10),
        (tx.notes ?? "-").slice(0, 30),
      ]);
    }
    console.log(table.toString());
    const pending = txs.filter((t) => t.needs_review === 1).length;
    if (pending > 0 && !opts.needsReview) {
      console.log();
      printInfo(
        chalk.yellow(`${pending} transaction(s) need review`) +
          chalk.dim(" — run `finsight trade list --needs-review` to filter"),
      );
    }
  });

function sourceLabel(s: PriceSource): string {
  switch (s) {
    case "user_provided":
      return chalk.green("user-provided");
    case "eod_close":
      return chalk.cyan("EOD close (fallback)");
    case "eod_nav":
      return chalk.magenta("EOD NAV");
    case "realtime_quote":
      return chalk.cyan("realtime quote");
    case "manual_entry":
      return chalk.dim("manual entry");
  }
}

function priceSourceShort(s: string | null | undefined): string {
  if (!s) return "—";
  if (s === "user_provided") return "user";
  if (s === "eod_close") return "close";
  if (s === "eod_nav") return "NAV";
  if (s === "realtime_quote") return "live";
  if (s === "manual_entry") return "manual";
  return s;
}
