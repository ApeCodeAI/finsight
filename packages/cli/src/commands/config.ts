import { Command } from "commander";
import chalk from "chalk";
import {
  CONFIG_KEYS,
  type ConfigKey,
  readConfig,
  writeConfig,
  getEffectiveConfig,
  configPath,
  DEFAULTS,
} from "@finsight/core";
import { createTable, printSuccess } from "../utils/display.js";
import { emitJson, fail, ExitCode } from "../utils/exit.js";

export const configCmd = new Command("config").description(
  "Read and write ~/.finsight/config.json",
);

const KEY_DESCRIPTION = `Allowed keys: ${CONFIG_KEYS.join(", ")}`;

configCmd
  .command("list")
  .description("Show the effective configuration (defaults merged with overrides)")
  .option("--json", "Emit JSON")
  .action((opts) => {
    const stored = readConfig();
    const effective = getEffectiveConfig();
    if (opts.json) {
      emitJson({ path: configPath(), stored, effective, defaults: DEFAULTS });
      process.exit(ExitCode.OK);
    }
    console.log(chalk.bold("  Config file: ") + configPath());
    console.log();
    const table = createTable(["Key", "Value", "Source"]);
    table.push([
      "base-currency",
      effective.base_currency,
      stored.base_currency ? "config" : chalk.dim("default"),
    ]);
    table.push([
      "display-locale",
      effective.display_locale,
      stored.display_locale ? "config" : chalk.dim("default"),
    ]);
    table.push([
      "labels-language",
      effective.labels_language,
      stored.labels_language ? "config" : chalk.dim("default"),
    ]);
    table.push([
      "ledger-dir",
      effective.ledger_dir || chalk.dim("(not set)"),
      stored.ledger_dir ? "config" : chalk.dim("default"),
    ]);
    table.push([
      "db-path",
      process.env.FINSIGHT_DB_PATH || effective.db_path || chalk.dim("(default)"),
      process.env.FINSIGHT_DB_PATH
        ? chalk.yellow("env FINSIGHT_DB_PATH")
        : stored.db_path
          ? "config"
          : chalk.dim("default"),
    ]);
    console.log(table.toString());
  });

configCmd
  .command("get")
  .description("Print one config value")
  .argument("<key>", KEY_DESCRIPTION)
  .option("--json", "Emit JSON")
  .action((key: string, opts) => {
    if (!CONFIG_KEYS.includes(key as ConfigKey)) {
      fail("USER_ERROR", `Unknown key: ${key}. ${KEY_DESCRIPTION}`, { json: opts.json });
    }
    const effective = getEffectiveConfig();
    const value =
      key === "base-currency"
        ? effective.base_currency
        : key === "display-locale"
          ? effective.display_locale
          : key === "labels-language"
            ? effective.labels_language
            : key === "ledger-dir"
              ? effective.ledger_dir
              : key === "db-path"
                ? effective.db_path
                : "";
    if (opts.json) {
      emitJson({ key, value });
      process.exit(ExitCode.OK);
    }
    console.log(value);
  });

configCmd
  .command("set")
  .description("Set one config value")
  .argument("<key>", KEY_DESCRIPTION)
  .argument("<value>", "New value (use empty string '' to clear)")
  .option("--json", "Emit JSON")
  .action((key: string, value: string, opts) => {
    if (!CONFIG_KEYS.includes(key as ConfigKey)) {
      fail("USER_ERROR", `Unknown key: ${key}. ${KEY_DESCRIPTION}`, { json: opts.json });
    }
    const k = key as ConfigKey;
    const cfg = readConfig();
    const field =
      k === "base-currency"
        ? "base_currency"
        : k === "display-locale"
          ? "display_locale"
          : k === "labels-language"
            ? "labels_language"
            : k === "ledger-dir"
              ? "ledger_dir"
              : "db_path";
    if (value === "") delete cfg[field];
    else cfg[field] = value;
    writeConfig(cfg);
    if (opts.json) {
      emitJson({ ok: true, key, value });
      process.exit(ExitCode.OK);
    }
    printSuccess(`Set ${key} = ${value || "(cleared)"}`);
  });

configCmd
  .command("path")
  .description("Print the config file path")
  .option("--json", "Emit JSON")
  .action((opts) => {
    if (opts.json) {
      emitJson({ path: configPath() });
      process.exit(ExitCode.OK);
    }
    console.log(configPath());
  });
