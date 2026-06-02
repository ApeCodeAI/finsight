import { Command } from "commander";
import chalk from "chalk";
import {
  listSymbols,
  getSymbolDetail,
  renameSymbol,
  setSymbolName,
} from "@finsight/core";
import { initDb } from "../utils/config.js";
import {
  createTable,
  formatCurrency,
  colorPnL,
  colorPercent,
  printSuccess,
} from "../utils/display.js";

function pctText(p: number): string {
  return `${(p * 100).toFixed(2)}%`;
}
import { emitJson, fail, ExitCode } from "../utils/exit.js";

export const symbolCmd = new Command("symbol").description(
  "Inspect and manage symbols (tickers)",
);

symbolCmd
  .command("list")
  .description("List aggregated symbols (cross-account)")
  .option("--json", "Emit JSON")
  .action((opts) => {
    const db = initDb();
    const syms = listSymbols(db);
    if (opts.json) {
      emitJson({ symbols: syms });
      process.exit(ExitCode.OK);
    }
    if (syms.length === 0) {
      console.log("No positions yet.");
      return;
    }
    const table = createTable([
      "Symbol",
      "Class",
      "Ccy",
      "Accts",
      "Qty",
      "CNY value",
      "P&L (CNY)",
      "Weight",
    ]);
    for (const s of syms) {
      table.push([
        s.symbol,
        s.asset_class,
        s.currencies.join("/"),
        String(s.account_count),
        s.total_quantity.toString(),
        formatCurrency(s.market_value_base),
        colorPnL(s.pnl_base, formatCurrency(s.pnl_base)),
        pctText(s.portfolio_weight),
      ]);
    }
    console.log(table.toString());
  });

symbolCmd
  .command("show")
  .description("Show a single symbol with its per-account breakdown")
  .argument("<symbol>", "Symbol / ticker")
  .option("--json", "Emit JSON")
  .action((symbol, opts) => {
    const db = initDb();
    const detail = getSymbolDetail(db, symbol);
    if (!detail) {
      fail("NOT_FOUND", `Symbol not found: ${symbol}`, {
        json: opts.json,
        hint: "Use `finsight symbol list` to see all symbols",
      });
    }
    if (opts.json) {
      emitJson(detail);
      process.exit(ExitCode.OK);
    }
    console.log();
    console.log(
      chalk.bold(`  ${detail.symbol}`) +
        (detail.name ? chalk.dim(` — ${detail.name}`) : ""),
    );
    console.log(
      `  Class: ${detail.asset_class}  ·  CCY: ${detail.currencies.join("/")}  ·  ${detail.account_count} accounts`,
    );
    console.log(
      `  Total qty: ${detail.total_quantity}  ·  Weighted cost: ${detail.avg_cost.toFixed(4)} ${detail.primary_currency}`,
    );
    console.log(
      `  CNY market value: ${chalk.yellowBright(formatCurrency(detail.market_value_base))}  ·  Weight: ${pctText(detail.portfolio_weight)}`,
    );
    console.log(
      `  CNY P&L: ${colorPnL(detail.pnl_base, formatCurrency(detail.pnl_base))} (${pctText(detail.pnl_pct_base)})`,
    );
    console.log();
    const table = createTable([
      "Account",
      "Ccy",
      "Qty",
      "Cost",
      "Price",
      "Native value",
      "CNY value",
      "CNY P&L",
    ]);
    for (const leg of detail.legs) {
      table.push([
        leg.account_name,
        leg.currency,
        leg.quantity.toString(),
        leg.avg_cost.toFixed(4),
        leg.current_price.toFixed(4),
        formatCurrency(leg.market_value, leg.currency),
        formatCurrency(leg.market_value_base),
        colorPnL(leg.pnl_base, formatCurrency(leg.pnl_base)),
      ]);
    }
    console.log(table.toString());
  });

symbolCmd
  .command("rename")
  .description("Rename a symbol (e.g. 拼多多 → PDD). Updates all positions.")
  .argument("<oldSymbol>", "Current symbol (e.g. 拼多多)")
  .argument("<newSymbol>", "New ticker (e.g. PDD)")
  .option("--json", "Emit JSON")
  .action((oldSymbol, newSymbol, opts) => {
    const db = initDb();
    const updated = renameSymbol(db, oldSymbol, newSymbol);
    if (updated === 0) {
      fail("NOT_FOUND", `No positions with symbol "${oldSymbol}"`, {
        json: opts.json,
      });
    }
    if (opts.json) {
      emitJson({ ok: true, updated, from: oldSymbol, to: newSymbol });
      process.exit(ExitCode.OK);
    }
    printSuccess(`Renamed ${updated} position(s): ${oldSymbol} → ${newSymbol}`);
  });

symbolCmd
  .command("set-name")
  .description("Set display name for all positions with the given symbol")
  .argument("<symbol>", "Symbol / ticker")
  .argument("<name>", "Display name")
  .option("--json", "Emit JSON")
  .action((symbol, name, opts) => {
    const db = initDb();
    const updated = setSymbolName(db, symbol, name);
    if (updated === 0) {
      fail("NOT_FOUND", `No positions with symbol "${symbol}"`, {
        json: opts.json,
      });
    }
    if (opts.json) {
      emitJson({ ok: true, updated, symbol, name });
      process.exit(ExitCode.OK);
    }
    printSuccess(`Updated ${updated} position(s): ${symbol} → name "${name}"`);
  });
