import { Command } from "commander";
import chalk from "chalk";
import {
  getAccountPerformance,
  getPortfolioPerformance,
  getAllPerformance,
  listAccounts,
} from "@finsight/core";
import { initDb } from "../utils/config.js";
import {
  createTable,
  formatCurrency,
  colorPercent,
} from "../utils/display.js";
import { emitJson, fail, ExitCode } from "../utils/exit.js";

export const performanceCmd = new Command("performance")
  .alias("perf")
  .description(
    "Compute time-weighted / money-weighted annualized returns (XIRR) per account + overall",
  )
  .option("--account <name>", "Show only one account (name or partial match)")
  .option("--json", "Emit JSON (AI-friendly)")
  .action((opts) => {
    const db = initDb();

    if (opts.account) {
      const accs = listAccounts(db, { includeInactive: true });
      const lower = String(opts.account).toLowerCase();
      const acc =
        accs.find((a) => a.name.toLowerCase() === lower) ??
        accs.find((a) => a.name.toLowerCase().includes(lower));
      if (!acc)
        fail("NOT_FOUND", `Account not found: ${opts.account}`, {
          json: opts.json,
        });
      const r = getAccountPerformance(db, acc.id);
      if (!r) fail("NOT_FOUND", "No performance data", { json: opts.json });
      if (opts.json) {
        emitJson(r);
        process.exit(ExitCode.OK);
      }
      printOne(r);
      return;
    }

    const result = getAllPerformance(db);
    if (opts.json) {
      emitJson(result);
      process.exit(ExitCode.OK);
    }

    const t = createTable([
      "Account",
      "Period",
      "Deposited",
      "Current",
      "Return",
      "XIRR",
    ]);
    for (const r of result.accounts) {
      if (r.cashflow_count === 0 && r.current_value === 0) continue;
      t.push([
        r.account_name,
        periodString(r),
        formatCurrency(r.net_deposits, r.currency),
        formatCurrency(r.current_value, r.currency),
        renderReturn(r.total_return, r.total_return_pct, r.currency),
        renderXirr(r.xirr, r.cashflow_count),
      ]);
    }
    console.log(t.toString());
    console.log();
    printOne(result.overall, { highlight: true });
  });

function periodString(r: { days: number; period_start: string }): string {
  if (r.days <= 0) return "—";
  const years = r.days / 365;
  if (years >= 1) return `${years.toFixed(1)}y`;
  const months = r.days / 30;
  if (months >= 1) return `${months.toFixed(1)}m`;
  return `${r.days}d`;
}

function renderReturn(
  total: number,
  pct: number | null,
  currency: string,
): string {
  const color = total >= 0 ? chalk.green : chalk.red;
  const sign = total >= 0 ? "+" : "";
  const pctStr = pct == null ? "" : ` (${colorPercent(pct)})`;
  return color(`${sign}${formatCurrency(total, currency)}`) + pctStr;
}

function renderXirr(xirr: number | null, cashflowCount: number): string {
  if (xirr == null) {
    return cashflowCount === 0 ? chalk.dim("no cashflows") : chalk.dim("—");
  }
  return colorPercent(xirr);
}

function printOne(
  r: ReturnType<typeof getPortfolioPerformance>,
  opts: { highlight?: boolean } = {},
) {
  const banner = opts.highlight
    ? chalk.bold.yellowBright(`  ${r.account_name}`)
    : chalk.bold(`  ${r.account_name}`);
  console.log();
  console.log(banner);
  console.log(
    chalk.dim(
      `  Period: ${r.period_start} → ${r.period_end}  (${periodString(r)})  ·  ${r.cashflow_count} cashflows`,
    ),
  );
  const lines = [
    ["Net deposits", formatCurrency(r.net_deposits, r.currency)],
    ["Current value", formatCurrency(r.current_value, r.currency)],
    ["Total return", renderReturn(r.total_return, r.total_return_pct, r.currency)],
    ["Annualized (XIRR)", renderXirr(r.xirr, r.cashflow_count)],
  ];
  const labelW = Math.max(...lines.map((l) => l[0]!.length));
  for (const [k, v] of lines) {
    console.log(`  ${k!.padEnd(labelW)}   ${v}`);
  }
  console.log();
}
