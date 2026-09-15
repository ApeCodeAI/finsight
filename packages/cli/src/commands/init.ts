import { Command } from "commander";
import path from "node:path";
import { existsSync, copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { homedir, tmpdir } from "node:os";
import chalk from "chalk";
import { input, select } from "@inquirer/prompts";
import {
  readConfig,
  writeConfig,
  configPath,
  ensureLedgerSkeleton,
  ensureReadme,
  rebuildDbFromLedger,
  findPopulatedPortfolioTables,
  getDbPath,
  DEFAULTS,
} from "@finsight/core";
import { initDb } from "../utils/config.js";
import { emitJson, fail, ExitCode } from "../utils/exit.js";
import { printSuccess } from "../utils/display.js";

export interface InitAnswers {
  base_currency: string;
  display_locale: string;
  labels_language: string;
  ledger_dir?: string;
  demo: "en" | "zh" | "none";
}

function findExamplesDir(): string | null {
  const fromCli = path.resolve(
    fileURLToPath(import.meta.url),
    "../../../..",
    "examples",
  );
  if (existsSync(fromCli)) return fromCli;
  const home = process.env.FINSIGHT_HOME;
  if (home) {
    const fromHome = path.join(home, "examples");
    if (existsSync(fromHome)) return fromHome;
  }
  return null;
}

export const initCmd = new Command("init")
  .description("First-time interactive setup wizard")
  .option("--force", "Overwrite existing config only; never replace portfolio data")
  .option(
    "--non-interactive",
    "Use flags only; suitable for CI / scripts. Combine with --base-currency etc.",
  )
  .option("--base-currency <ccy>", "Override base currency (e.g. USD)")
  .option("--display-locale <locale>", "Override Intl locale (e.g. en-US)")
  .option("--labels-language <lang>", "Override labels language (en / zh)")
  .option(
    "--ledger-dir <dir>",
    "Configure an optional legacy ledger export/import directory",
  )
  .option(
    "--demo <variant>",
    "Load demo data: en / zh / none",
    /^(en|zh|none)$/,
  )
  .option("--json", "Emit JSON summary")
  .action(async (opts) => {
    const existing = readConfig();
    const alreadyConfigured =
      existing.base_currency ?? existing.ledger_dir ?? existing.labels_language;
    if (alreadyConfigured && !opts.force) {
      fail("USER_ERROR", "FinSight is already configured. Re-run with --force to overwrite.", {
        json: opts.json,
        hint: `current config: ${configPath()}`,
      });
    }

    const answers = opts.nonInteractive
      ? collectInitAnswersFromFlags(opts)
      : await collectFromPrompts();

    if (answers.demo !== "none") {
      let populatedTables: string[];
      try {
        populatedTables = findPopulatedPortfolioTables(getDbPath());
      } catch (error) {
        fail(
          "DATA_CONFLICT",
          `Cannot safely inspect the authoritative SQLite database before loading demo data: ${error instanceof Error ? error.message : String(error)}`,
          {
            json: opts.json,
            hint: "Use a new empty database path for demo data.",
          },
        );
      }
      if (populatedTables.length > 0) {
        fail(
          "DATA_CONFLICT",
          `Refusing to load demo data because the authoritative SQLite database contains portfolio data (${populatedTables.join(", ")}).`,
          {
            json: opts.json,
            hint: "Use a new empty database path; --force only overwrites config.",
          },
        );
      }
    }

    const cfg = readConfig();
    cfg.base_currency = answers.base_currency;
    cfg.display_locale = answers.display_locale;
    cfg.labels_language = answers.labels_language;
    if (answers.ledger_dir !== undefined) cfg.ledger_dir = answers.ledger_dir;
    writeConfig(cfg);

    if (answers.ledger_dir) {
      ensureLedgerSkeleton(answers.ledger_dir);
      ensureReadme(answers.ledger_dir);
    }

    let demoLoaded = false;
    let demoCounts:
      | {
          accounts: number;
          positions: number;
          transactions: number;
          snapshots: number;
          fx_rates: number;
        }
      | undefined;
    if (answers.demo !== "none") {
      const examplesDir = findExamplesDir();
      if (!examplesDir) {
        if (!opts.json) {
          process.stderr.write(
            chalk.yellow("⚠ Could not locate examples/ directory — skipping demo data.\n"),
          );
        }
      } else {
        const src = path.join(examplesDir, `seed-portfolio.${answers.demo}.yaml`);
        const tickerSrc = path.join(examplesDir, "tickers.cn.yaml");
        if (!existsSync(src)) {
          if (!opts.json) {
            process.stderr.write(chalk.yellow(`⚠ Demo source not found: ${src}\n`));
          }
        } else {
          const importDir =
            answers.ledger_dir ?? mkdtempSync(path.join(tmpdir(), "finsight-demo-import-"));
          try {
            ensureLedgerSkeleton(importDir);
            copyFileSync(src, path.join(importDir, "accounts.yaml"));
            if (answers.ledger_dir && answers.demo === "zh" && existsSync(tickerSrc)) {
              copyFileSync(tickerSrc, path.join(importDir, "tickers.yaml"));
            }
            const db = initDb();
            demoCounts = rebuildDbFromLedger(db, importDir);
            db.$client.close();
            demoLoaded = true;
          } finally {
            if (!answers.ledger_dir) rmSync(importDir, { recursive: true, force: true });
          }
        }
      }
    }

    if (opts.json) {
      emitJson({
        ok: true,
        config: cfg,
        ledger_dir: cfg.ledger_dir ?? null,
        demo_loaded: demoLoaded,
        demo_variant: answers.demo,
        ...(demoCounts ?? {}),
      });
      process.exit(ExitCode.OK);
    }

    console.log();
    printSuccess(`Wrote ${configPath()}`);
    if (answers.ledger_dir) {
      printSuccess(`Configured legacy ledger interoperability at ${answers.ledger_dir}`);
    }
    if (demoLoaded && demoCounts) {
      printSuccess(`Loaded ${demoCounts.accounts} demo accounts (${demoCounts.positions} positions)`);
    }
    console.log();
    console.log(chalk.bold("Next steps:"));
    console.log(`  ${chalk.cyan("finsight overview")}              # See your portfolio`);
    console.log(`  ${chalk.cyan("finsight web")}                   # Open the dashboard`);
    console.log(`  ${chalk.cyan("finsight account add")}           # Add your real accounts`);
    console.log(
      chalk.dim(`  ${chalk.cyan("finsight backup create")}            # create a verified DB backup`),
    );
    console.log();
  });

async function collectFromPrompts(): Promise<InitAnswers> {
  console.log();
  console.log(chalk.bold("  Welcome to FinSight!"));
  console.log(chalk.dim("  Local-first portfolio tracker · AI-friendly · SQLite-backed"));
  console.log();

  const base_currency = await select({
    message: "Base currency (everything reconciles to this):",
    choices: [
      { value: "USD", name: "USD — US Dollar" },
      { value: "CNY", name: "CNY — Chinese Yuan" },
      { value: "EUR", name: "EUR — Euro" },
      { value: "JPY", name: "JPY — Japanese Yen" },
      { value: "HKD", name: "HKD — Hong Kong Dollar" },
      { value: "GBP", name: "GBP — British Pound" },
      { value: "other", name: "Other (type code)" },
    ],
    default: DEFAULTS.base_currency,
  });
  const finalBase =
    base_currency === "other"
      ? (await input({ message: "ISO currency code (3 letters):" })).trim().toUpperCase()
      : base_currency;
  const display_locale = await input({
    message: "Display locale (Intl format, e.g. en-US, zh-CN, ja-JP):",
    default: DEFAULTS.display_locale,
  });
  const labels_language = await select({
    message: "Labels language (UI / CLI strings):",
    choices: [
      { value: "en", name: "English" },
      { value: "zh", name: "中文" },
    ],
    default: DEFAULTS.labels_language,
  });
  const demo = (await select({
    message: "Load demo data so you have something to look at?",
    choices: [
      { value: "en" as const, name: "Yes — US-leaning portfolio (VOO/AAPL/NVDA/cash/BTC)" },
      { value: "zh" as const, name: "Yes — China-leaning (A 股基金 + 港股 + 美股 + 加密)" },
      { value: "none" as const, name: "No — I'll add my accounts manually" },
    ],
    default: labels_language === "zh" ? "zh" : "en",
  })) as "en" | "zh" | "none";
  return { base_currency: finalBase, display_locale, labels_language, demo };
}

export function collectInitAnswersFromFlags(opts: {
  baseCurrency?: string;
  displayLocale?: string;
  labelsLanguage?: string;
  ledgerDir?: string;
  demo?: "en" | "zh" | "none";
}): InitAnswers {
  return {
    base_currency: (opts.baseCurrency ?? DEFAULTS.base_currency).toUpperCase(),
    display_locale: opts.displayLocale ?? DEFAULTS.display_locale,
    labels_language: opts.labelsLanguage ?? DEFAULTS.labels_language,
    ...(opts.ledgerDir
      ? { ledger_dir: path.resolve(expandHome(opts.ledgerDir)) }
      : {}),
    demo: opts.demo ?? "none",
  };
}

function expandHome(p: string): string {
  if (p.startsWith("~/")) return path.join(homedir(), p.slice(2));
  return p;
}
