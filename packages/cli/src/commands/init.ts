import { Command } from "commander";
import path from "node:path";
import { existsSync, copyFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import chalk from "chalk";
import { input, select, confirm } from "@inquirer/prompts";
import {
  readConfig,
  writeConfig,
  configPath,
  ensureLedgerSkeleton,
  ensureReadme,
  rebuildDbFromLedger,
  DEFAULTS,
} from "@finsight/core";
import { initDb } from "../utils/config.js";
import { emitJson, fail, ExitCode } from "../utils/exit.js";
import { printSuccess, printInfo } from "../utils/display.js";

interface InitAnswers {
  base_currency: string;
  display_locale: string;
  labels_language: string;
  ledger_dir: string;
  demo: "en" | "zh" | "none";
}

function findExamplesDir(): string | null {
  // 1. From the source tree (development)
  const fromCli = path.resolve(
    fileURLToPath(import.meta.url),
    "../../../..",
    "examples",
  );
  if (existsSync(fromCli)) return fromCli;
  // 2. From the repo root if FINSIGHT_HOME points there
  const home = process.env.FINSIGHT_HOME;
  if (home) {
    const fromHome = path.join(home, "examples");
    if (existsSync(fromHome)) return fromHome;
  }
  return null;
}

/**
 * Suggest a sensible default ledger directory. If the user appears to have an
 * Obsidian vault at one of the common locations, prefer placing the ledger
 * under it so portfolio data and notes live side by side. Otherwise drop a
 * plain `~/finsight-vault`.
 */
function defaultLedgerSuggestion(): string {
  const obsidianCandidates = [
    path.join(homedir(), "Documents", "Obsidian Vault", "finsight"),
    path.join(homedir(), "Obsidian", "finsight"),
    path.join(homedir(), "notes", "finsight"),
    path.join(homedir(), "vault", "finsight"),
  ];
  for (const candidate of obsidianCandidates) {
    if (existsSync(path.dirname(candidate))) return candidate;
  }
  return path.join(homedir(), "finsight-vault");
}

export const initCmd = new Command("init")
  .description("First-time interactive setup wizard")
  .option("--force", "Overwrite existing config")
  .option(
    "--non-interactive",
    "Use flags only; suitable for CI / scripts. Combine with --base-currency etc.",
  )
  .option("--base-currency <ccy>", "Override base currency (e.g. USD)")
  .option("--display-locale <locale>", "Override Intl locale (e.g. en-US)")
  .option("--labels-language <lang>", "Override labels language (en / zh)")
  .option("--ledger-dir <dir>", "Override ledger directory")
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
      ? collectFromFlags(opts)
      : await collectFromPrompts(opts);

    // Persist config
    const cfg = readConfig();
    cfg.base_currency = answers.base_currency;
    cfg.display_locale = answers.display_locale;
    cfg.labels_language = answers.labels_language;
    cfg.ledger_dir = answers.ledger_dir;
    writeConfig(cfg);

    // Skeleton + README
    ensureLedgerSkeleton(answers.ledger_dir);
    ensureReadme(answers.ledger_dir);

    // Demo data
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
            chalk.yellow(
              "⚠ Could not locate examples/ directory — skipping demo data.\n",
            ),
          );
        }
      } else {
        const src = path.join(examplesDir, `seed-portfolio.${answers.demo}.yaml`);
        const tickerSrc = path.join(examplesDir, `tickers.cn.yaml`);
        const dst = path.join(answers.ledger_dir, "accounts.yaml");
        if (!existsSync(src)) {
          if (!opts.json) {
            process.stderr.write(
              chalk.yellow(`⚠ Demo source not found: ${src}\n`),
            );
          }
        } else {
          copyFileSync(src, dst);
          if (answers.demo === "zh" && existsSync(tickerSrc)) {
            copyFileSync(tickerSrc, path.join(answers.ledger_dir, "tickers.yaml"));
          }
          const db = initDb();
          demoCounts = rebuildDbFromLedger(db, answers.ledger_dir);
          demoLoaded = true;
        }
      }
    }

    if (opts.json) {
      emitJson({
        ok: true,
        config: cfg,
        ledger_dir: answers.ledger_dir,
        demo_loaded: demoLoaded,
        demo_variant: answers.demo,
        ...(demoCounts ?? {}),
      });
      process.exit(ExitCode.OK);
    }

    console.log();
    printSuccess(`Wrote ${configPath()}`);
    printSuccess(`Created vault at ${answers.ledger_dir}`);
    if (demoLoaded && demoCounts) {
      printSuccess(
        `Loaded ${demoCounts.accounts} demo accounts (${demoCounts.positions} positions)`,
      );
    }
    console.log();
    console.log(chalk.bold("Next steps:"));
    console.log(`  ${chalk.cyan("finsight overview")}              # See your portfolio`);
    console.log(`  ${chalk.cyan("finsight web")}                   # Open the dashboard`);
    console.log(`  ${chalk.cyan("finsight account add")}           # Add your real accounts`);
    if (answers.demo !== "none") {
      console.log(
        chalk.dim(
          `  ${chalk.cyan("finsight ledger restore --yes")}  # rebuild from vault any time`,
        ),
      );
    }
    console.log();
  });

async function collectFromPrompts(opts: { force?: boolean }): Promise<InitAnswers> {
  console.log();
  console.log(chalk.bold("  Welcome to FinSight!"));
  console.log(chalk.dim("  Local-first portfolio tracker · AI-friendly · vault-backed"));
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

  const suggested = defaultLedgerSuggestion();
  const ledger_dir_input = await input({
    message: "Where should the vault ledger live?",
    default: suggested,
  });
  const ledger_dir = path.resolve(expandHome(ledger_dir_input));

  const demo = (await select({
    message: "Load demo data so you have something to look at?",
    choices: [
      {
        value: "en" as const,
        name: "Yes — US-leaning portfolio (VOO/AAPL/NVDA/cash/BTC)",
      },
      {
        value: "zh" as const,
        name: "Yes — China-leaning (A 股基金 + 港股 + 美股 + 加密)",
      },
      { value: "none" as const, name: "No — I'll add my accounts manually" },
    ],
    default: labels_language === "zh" ? "zh" : "en",
  })) as "en" | "zh" | "none";

  return { base_currency: finalBase, display_locale, labels_language, ledger_dir, demo };
}

function collectFromFlags(opts: {
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
    ledger_dir: path.resolve(
      expandHome(opts.ledgerDir ?? defaultLedgerSuggestion()),
    ),
    demo: opts.demo ?? "none",
  };
}

function expandHome(p: string): string {
  if (p.startsWith("~/")) return path.join(homedir(), p.slice(2));
  return p;
}

// Silence unused import warning — `confirm` and `readdirSync` are reserved for future expansion.
void confirm;
void readdirSync;
