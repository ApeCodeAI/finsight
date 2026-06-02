import { Command } from "commander";
import chalk from "chalk";
import {
  listPositions,
  listAccounts,
  updatePriceBySymbol,
  upsertFxRate,
  getBaseCurrency,
} from "@finsight/core";
import { fetchQuotes, fetchFx } from "@finsight/connector-yfinance";
import { fetchFundNavs } from "@finsight/connector-tiantian";
import { initDb } from "../utils/config.js";
import { createTable, printSuccess, printInfo } from "../utils/display.js";
import { emitJson, ExitCode } from "../utils/exit.js";

export const quoteCmd = new Command("quote").description(
  "Fetch and update market data (Yahoo Finance + 天天基金 — no API key)",
);

interface PositionResultRow {
  symbol: string;
  status: "ok" | "unsupported" | "error";
  old_price?: number;
  new_price?: number;
  currency?: string;
  reason?: string;
  updated_rows?: number;
  source?: string;
}

interface FxResultRow {
  from: string;
  to: string;
  status: "ok" | "error";
  old_rate?: number;
  new_rate?: number;
  reason?: string;
}

quoteCmd
  .command("update")
  .description("Pull current prices for all open positions and FX rates → base")
  .option("--symbols <list>", "Comma-separated subset (e.g. PDD,MSFT)")
  .option("--fx-only", "Skip positions, refresh FX rates only")
  .option("--no-fx", "Skip FX, refresh positions only")
  .option("--dry-run", "Show what would change, don't write")
  .option("--json", "Emit JSON")
  .option("--concurrency <n>", "Max parallel HTTP requests", "4")
  .action(async (opts) => {
    const db = initDb();
    const base = getBaseCurrency();
    const concurrency = Math.max(1, Number(opts.concurrency) || 4);

    // ── 1. Positions ──────────────────────────────────────────────────────
    const posResults: PositionResultRow[] = [];

    if (!opts.fxOnly) {
      const filterSymbols = opts.symbols
        ? new Set(
            (opts.symbols as string)
              .split(",")
              .map((s: string) => s.trim())
              .filter(Boolean),
          )
        : null;
      const open = listPositions(db);
      const seen = new Map<string, { currency: string }>();
      for (const p of open) {
        if (filterSymbols && !filterSymbols.has(p.symbol)) continue;
        if (!seen.has(p.symbol)) seen.set(p.symbol, { currency: p.currency });
      }
      const distinct = Array.from(seen.entries());
      // Route 6-digit numeric codes to Tiantian; rest to yfinance.
      const tiantianCodes: string[] = [];
      const yfList: Array<{ symbol: string; hint?: "crypto" | "fx" }> = [];
      for (const [symbol, info] of distinct) {
        if (/^\d{6}$/.test(symbol)) {
          tiantianCodes.push(symbol);
        } else {
          yfList.push({
            symbol,
            hint:
              info.currency === "USDT" ||
              info.currency === "BTC" ||
              info.currency === "ETH"
                ? ("crypto" as const)
                : undefined,
          });
        }
      }

      // Fetch from both sources in parallel
      const [yfOutcomes, ttOutcomes] = await Promise.all([
        fetchQuotes(yfList, concurrency),
        fetchFundNavs(tiantianCodes, concurrency),
      ]);

      function applyOne(
        symbol: string,
        source: "yfinance" | "tiantian",
        ok: { price: number; currency: string },
      ): void {
        if (opts.dryRun) {
          const sample = open.find((p) => p.symbol === symbol);
          posResults.push({
            symbol,
            status: "ok",
            old_price: sample?.current_price,
            new_price: ok.price,
            currency: ok.currency,
            updated_rows: open.filter((p) => p.symbol === symbol).length,
            source,
          });
        } else {
          const { updated, old_prices } = updatePriceBySymbol(db, symbol, ok.price);
          posResults.push({
            symbol,
            status: "ok",
            old_price: old_prices[0],
            new_price: ok.price,
            currency: ok.currency,
            updated_rows: updated,
            source,
          });
        }
      }

      yfList.forEach(({ symbol }, i) => {
        const o = yfOutcomes[i];
        if (o.status !== "ok") {
          posResults.push({
            symbol,
            status: o.status,
            reason: "reason" in o ? o.reason : undefined,
            source: "yfinance",
          });
          return;
        }
        applyOne(symbol, "yfinance", { price: o.price, currency: o.currency });
      });

      tiantianCodes.forEach((symbol, i) => {
        const o = ttOutcomes[i];
        if (o.status !== "ok") {
          posResults.push({
            symbol,
            status: "error",
            reason: o.reason,
            source: "tiantian",
          });
          return;
        }
        // Funds are CNY by convention.
        applyOne(symbol, "tiantian", {
          price: o.quote.current_price,
          currency: "CNY",
        });
      });
    }

    // ── 2. FX rates ──────────────────────────────────────────────────────
    const fxResults: FxResultRow[] = [];

    if (opts.fx !== false) {
      const accs = listAccounts(db, { includeInactive: true });
      const open = listPositions(db);
      const ccys = new Set<string>();
      for (const a of accs) if (a.currency && a.currency !== base) ccys.add(a.currency);
      for (const p of open) if (p.currency && p.currency !== base) ccys.add(p.currency);
      for (const from of Array.from(ccys)) {
        const r = await fetchFx(from, base);
        if ("error" in r) {
          fxResults.push({ from, to: base, status: "error", reason: r.error });
          continue;
        }
        if (opts.dryRun) {
          fxResults.push({ from, to: base, status: "ok", new_rate: r.rate });
        } else {
          const { previous } = upsertFxRate(db, from, base, r.rate);
          fxResults.push({
            from,
            to: base,
            status: "ok",
            old_rate: previous,
            new_rate: r.rate,
          });
        }
      }
    }

    const summary = {
      base_currency: base,
      dry_run: !!opts.dryRun,
      positions: {
        ok: posResults.filter((r) => r.status === "ok").length,
        unsupported: posResults.filter((r) => r.status === "unsupported").length,
        error: posResults.filter((r) => r.status === "error").length,
        results: posResults,
      },
      fx: {
        ok: fxResults.filter((r) => r.status === "ok").length,
        error: fxResults.filter((r) => r.status === "error").length,
        results: fxResults,
      },
    };

    if (opts.json) {
      emitJson(summary);
      const failed =
        summary.positions.error + summary.fx.error + summary.positions.unsupported;
      process.exit(failed > 0 ? ExitCode.DATA_CONFLICT : ExitCode.OK);
    }

    console.log();
    if (posResults.length > 0) {
      console.log(chalk.bold("  Positions"));
      const t = createTable(["Status", "Symbol", "Old", "New", "Δ", "CCY", "Source"]);
      const sorted = [...posResults].sort((a, b) =>
        (a.source ?? "z").localeCompare(b.source ?? "z") || a.symbol.localeCompare(b.symbol),
      );
      for (const r of sorted) {
        const srcTag = r.source === "tiantian"
          ? chalk.magenta("tiantian")
          : r.source === "yfinance"
            ? chalk.cyan("yfinance")
            : chalk.dim("—");
        if (r.status === "ok" && r.new_price != null && r.old_price != null) {
          const diff = r.new_price - r.old_price;
          const pct = (diff / r.old_price) * 100;
          const color = diff > 0 ? chalk.green : diff < 0 ? chalk.red : chalk.dim;
          t.push([
            chalk.green("✓"),
            r.symbol,
            r.old_price.toFixed(4),
            r.new_price.toFixed(4),
            color(`${diff >= 0 ? "+" : ""}${diff.toFixed(4)} (${pct.toFixed(2)}%)`),
            r.currency ?? "",
            srcTag,
          ]);
        } else if (r.status === "unsupported") {
          t.push([chalk.yellow("·"), r.symbol, "—", "—", chalk.dim(r.reason ?? ""), "", srcTag]);
        } else {
          t.push([chalk.red("✗"), r.symbol, "—", "—", chalk.red(r.reason ?? ""), "", srcTag]);
        }
      }
      console.log(t.toString());
    }
    if (fxResults.length > 0) {
      console.log();
      console.log(chalk.bold(`  FX rates → ${base}`));
      const t = createTable(["Status", "Pair", "Old", "New", "Δ"]);
      for (const r of fxResults) {
        if (r.status === "ok" && r.new_rate != null) {
          const diff = r.old_rate != null ? r.new_rate - r.old_rate : Number.NaN;
          const display = Number.isNaN(diff) ? chalk.dim("(new)") : diff.toFixed(4);
          const color = diff > 0 ? chalk.green : diff < 0 ? chalk.red : chalk.dim;
          t.push([
            chalk.green("✓"),
            `${r.from}/${r.to}`,
            r.old_rate?.toFixed(4) ?? "—",
            r.new_rate.toFixed(4),
            color(display),
          ]);
        } else {
          t.push([
            chalk.red("✗"),
            `${r.from}/${r.to}`,
            "—",
            "—",
            chalk.red(r.reason ?? ""),
          ]);
        }
      }
      console.log(t.toString());
    }
    console.log();
    if (opts.dryRun) {
      printInfo("Dry run — no changes written. Drop --dry-run to apply.");
    } else {
      printSuccess(
        `Updated ${summary.positions.ok} symbol(s) and ${summary.fx.ok} FX rate(s)`,
      );
      if (summary.positions.unsupported > 0) {
        printInfo(
          `${summary.positions.unsupported} symbol(s) unsupported by Yahoo Finance (e.g. 6-digit China funds)`,
        );
      }
    }
  });
