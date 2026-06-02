import { Command } from "commander";
import {
  getNetWorth,
  getNetWorthByAssetClass,
  listSymbols,
  listAccounts,
  listSnapshots,
  listDecisions,
  checkDecisionTriggers,
  listTransactionsNeedingRationale,
  checkTarget,
  getEffectiveConfig,
} from "@finsight/core";
import { initDb } from "../utils/config.js";
import { emitJson, ExitCode } from "../utils/exit.js";

export const contextCmd = new Command("context")
  .description(
    "Emit an LLM-ready Markdown briefing of your portfolio — pipe to Claude / GPT / etc.",
  )
  .option("--json", "Emit JSON instead of Markdown")
  .option("--top <n>", "How many top symbols to include", "10")
  .action((opts) => {
    const db = initDb();
    const cfg = getEffectiveConfig();
    const nw = getNetWorth(db);
    const byClass = getNetWorthByAssetClass(db);
    const syms = listSymbols(db);
    const accs = listAccounts(db);
    const recentDecisions = listDecisions(db).slice(0, 10);
    const triggers = checkDecisionTriggers(db).filter((t) => t.triggered);
    const pendingRationale = listTransactionsNeedingRationale(db);
    const targetCheck = checkTarget(db);
    const snaps = listSnapshots(db).filter(
      (s) => !(s.notes?.startsWith("yzyx-historical:") ?? false),
    );
    const topN = Math.max(1, Number(opts.top) || 10);

    if (opts.json) {
      emitJson({
        config: {
          base_currency: cfg.base_currency,
          display_locale: cfg.display_locale,
          labels_language: cfg.labels_language,
        },
        as_of: new Date().toISOString(),
        net_worth: { total: nw.total, currency: nw.currency },
        by_asset_class: byClass.buckets.map((b) => ({
          class: b.asset_class,
          label: b.label,
          value_base: b.value_base,
          weight: b.weight,
          pnl_base: b.pnl_base,
          pnl_pct: b.pnl_pct,
        })),
        top_symbols: syms.slice(0, topN).map((s) => ({
          symbol: s.symbol,
          name: s.name,
          asset_class: s.asset_class,
          value_base: s.market_value_base,
          pnl_base: s.pnl_base,
          pnl_pct: s.pnl_pct_base,
          weight: s.portfolio_weight,
          accounts: s.account_count,
        })),
        accounts: nw.byAccount.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          balance_base: a.balance_base,
          currency: a.currency,
        })),
        snapshot_count: snaps.length,
        recent_decisions: recentDecisions.map((d) => ({
          id: d.id,
          date: d.date,
          type: d.type,
          title: d.title,
          symbols: d.symbols,
          conviction: d.conviction,
          exit_target: d.exit_target,
          stop_loss: d.stop_loss,
        })),
        triggered_alerts: triggers,
        pending_rationale_count: pendingRationale.length,
        target: targetCheck
          ? {
              name: targetCheck.target_name,
              max_drift: targetCheck.max_drift,
              gaps: targetCheck.gaps.map((g) => ({
                class: g.asset_class,
                target_weight: g.target_weight,
                current_weight: g.current_weight,
                gap_weight: g.gap_weight,
                gap_value_base: g.gap_value_base,
                status: g.status,
              })),
            }
          : null,
      });
      process.exit(ExitCode.OK);
    }

    // Markdown
    const lines: string[] = [];
    const base = cfg.base_currency;
    const fmt = (n: number) =>
      n.toLocaleString(cfg.display_locale, {
        style: "currency",
        currency: base,
        maximumFractionDigits: 2,
      });
    const pct = (r: number) =>
      r.toLocaleString(cfg.display_locale, {
        style: "percent",
        minimumFractionDigits: 2,
      });

    lines.push(`# FinSight portfolio briefing`);
    lines.push("");
    lines.push(`_Generated ${new Date().toISOString()} · base currency: \`${base}\`_`);
    lines.push("");
    lines.push(`## Net worth`);
    lines.push("");
    lines.push(`**${fmt(nw.total)}** across ${accs.length} accounts.`);
    lines.push("");
    lines.push(`## Where the money sits`);
    lines.push("");
    lines.push(`| Class | Value (${base}) | Weight | P&L (${base}) | P&L % |`);
    lines.push(`|---|---:|---:|---:|---:|`);
    for (const b of byClass.buckets) {
      const hasPnl = b.cost_base > 0;
      lines.push(
        `| ${b.label} | ${fmt(b.value_base)} | ${pct(b.weight)} | ${
          hasPnl ? fmt(b.pnl_base) : "—"
        } | ${hasPnl ? pct(b.pnl_pct) : "—"} |`,
      );
    }
    lines.push("");
    lines.push(`## Top ${topN} holdings (by base-currency value)`);
    lines.push("");
    lines.push(`| Symbol | Name | Class | Accts | Value (${base}) | Weight | P&L % |`);
    lines.push(`|---|---|---|---:|---:|---:|---:|`);
    for (const s of syms.slice(0, topN)) {
      lines.push(
        `| \`${s.symbol}\` | ${s.name ?? ""} | ${s.asset_class} | ${
          s.account_count
        } | ${fmt(s.market_value_base)} | ${pct(s.portfolio_weight)} | ${pct(
          s.pnl_pct_base,
        )} |`,
      );
    }
    lines.push("");
    lines.push(`## Accounts`);
    lines.push("");
    lines.push(`| Account | Type | Currency | Value (${base}) |`);
    lines.push(`|---|---|---|---:|`);
    for (const a of nw.byAccount.sort((x, y) => y.balance_base - x.balance_base)) {
      lines.push(`| ${a.name} | ${a.type} | ${a.currency} | ${fmt(a.balance_base)} |`);
    }
    lines.push("");
    if (targetCheck) {
      lines.push(`## Target vs current — \`${targetCheck.target_name}\``);
      lines.push("");
      lines.push(
        `Max drift: **${(targetCheck.max_drift * 100).toFixed(1)}pp**.`,
      );
      lines.push("");
      lines.push(`| Class | Target | Current | Δ% | Δ value | Status |`);
      lines.push(`|---|---:|---:|---:|---:|---|`);
      for (const g of targetCheck.gaps) {
        lines.push(
          `| ${g.label} | ${(g.target_weight * 100).toFixed(1)}% | ${(g.current_weight * 100).toFixed(1)}% | ${(g.gap_weight * 100).toFixed(1)}pp | ${fmt(g.gap_value_base)} | ${g.status} |`,
        );
      }
      lines.push("");
    }
    if (triggers.length > 0) {
      lines.push(`## ⚠ Triggered alerts`);
      lines.push("");
      lines.push(`| Symbol | Kind | Threshold | Current | Decision |`);
      lines.push(`|---|---|---:|---:|---|`);
      for (const a of triggers) {
        lines.push(
          `| \`${a.symbol}\` | ${a.kind} | ${a.threshold} | ${a.current_price} | ${a.decision_id.slice(-12)} |`,
        );
      }
      lines.push("");
    }
    if (pendingRationale.length > 0) {
      lines.push(
        `_${pendingRationale.length} buy/sell transaction(s) have no rationale yet — run \`finsight decision review\`._`,
      );
      lines.push("");
    }
    if (recentDecisions.length > 0) {
      lines.push(`## Recent decisions`);
      lines.push("");
      for (const d of recentDecisions) {
        const meta = [
          d.conviction ? `conviction=${d.conviction}` : null,
          d.exit_target != null ? `exit=${d.exit_target}` : null,
          d.stop_loss != null ? `stop=${d.stop_loss}` : null,
          d.horizon ? `horizon=${d.horizon}` : null,
        ]
          .filter(Boolean)
          .join(", ");
        const subj = d.symbols.length > 0 ? `\`${d.symbols.join(",")}\` ` : "";
        lines.push(
          `- **${d.date}** ${subj}(${d.type})${meta ? ` — ${meta}` : ""}${
            d.title ? ` — ${d.title}` : ""
          }`,
        );
      }
      lines.push("");
    }
    lines.push(`## How to read this briefing`);
    lines.push("");
    lines.push(
      `All amounts are expressed in **${base}** after FX conversion. Use this as conversation context for an LLM — pipe it to Claude / GPT / Cursor and ask things like:`,
    );
    lines.push("");
    lines.push("- _Which positions are dragging down the portfolio the most?_");
    lines.push("- _If I want to rebalance to 60% equities / 30% bonds / 10% cash, what should I sell?_");
    lines.push("- _Identify any symbols that appear in more than one account with very different cost bases._");
    lines.push("");
    lines.push("---");
    lines.push(`Schema: \`account\` → \`positions\` (native ccy) and \`cash_balance\`; \`symbol\` aggregates positions across accounts; \`asset_class\` is heuristic (override via \`class:<name>\` tag).`);

    process.stdout.write(lines.join("\n") + "\n");
  });
