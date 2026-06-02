import { Command } from "commander";
import { listPositions, updatePrice, listAccounts } from "@finsight/core";
import { initDb } from "../utils/config.js";
import {
  createTable,
  formatCurrency,
  colorPnL,
  colorPercent,
  printSuccess,
} from "../utils/display.js";
import { emitJson, fail, ExitCode } from "../utils/exit.js";

export const positionCmd = new Command("position").description("Manage positions");

positionCmd
  .command("list")
  .description("List open positions")
  .option("--account <name>", "Filter by account name")
  .option("--json", "Emit JSON")
  .action((opts) => {
    const db = initDb();
    let accountId: string | undefined;

    if (opts.account) {
      const accs = listAccounts(db);
      const lower = opts.account.toLowerCase();
      const acc =
        accs.find((a) => a.name.toLowerCase() === lower) ??
        accs.find((a) => a.name.toLowerCase().includes(lower));
      if (!acc) {
        fail("NOT_FOUND", `Account not found: ${opts.account}`, { json: opts.json });
      }
      accountId = acc.id;
    }

    const pos = listPositions(db, accountId);
    const enriched = pos.map((p) => {
      const value = p.current_price * p.quantity;
      const cost = p.avg_cost * p.quantity;
      const pnl = value - cost;
      return {
        ...p,
        tags: p.tags ? JSON.parse(p.tags) : [],
        market_value: value,
        cost_basis: cost,
        pnl,
        pnl_pct: cost !== 0 ? pnl / cost : 0,
      };
    });

    if (opts.json) {
      emitJson({ positions: enriched });
      process.exit(ExitCode.OK);
    }

    if (pos.length === 0) {
      console.log("No open positions.");
      return;
    }

    const table = createTable([
      "ID",
      "Symbol",
      "Name",
      "Qty",
      "Avg Cost",
      "Price",
      "Value",
      "P&L",
      "P&L%",
    ]);
    for (const p of enriched) {
      table.push([
        p.id.slice(-8),
        p.symbol,
        p.name ?? "-",
        p.quantity.toString(),
        formatCurrency(p.avg_cost, p.currency),
        formatCurrency(p.current_price, p.currency),
        formatCurrency(p.market_value, p.currency),
        colorPnL(p.pnl, formatCurrency(p.pnl, p.currency)),
        colorPercent(p.pnl_pct),
      ]);
    }
    console.log(table.toString());
  });

positionCmd
  .command("update")
  .description("Update position current price")
  .argument("<id>", "Position ID (or partial)")
  .option("--price <price>", "New current price")
  .option("--json", "Emit JSON")
  .action((idInput, opts) => {
    const db = initDb();
    if (!opts.price) {
      fail("USER_ERROR", "--price is required", { json: opts.json });
    }
    const allPos = listPositions(db);
    const pos =
      allPos.find((p) => p.id === idInput) ??
      allPos.find((p) => p.id.endsWith(idInput));
    if (!pos) {
      fail("NOT_FOUND", `Position not found: ${idInput}`, { json: opts.json });
    }
    const price = Number(opts.price);
    if (Number.isNaN(price)) {
      fail("USER_ERROR", `Invalid price: ${opts.price}`, { json: opts.json });
    }
    const updated = updatePrice(db, pos.id, price);
    if (opts.json) {
      emitJson({ ok: true, position: updated });
      process.exit(ExitCode.OK);
    }
    printSuccess(`Price updated: ${pos.symbol} → ${formatCurrency(price, pos.currency)}`);
  });
