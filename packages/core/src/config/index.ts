import { homedir } from "node:os";
import path from "node:path";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";

/**
 * User-level config persisted to ~/.finsight/config.json.
 *
 * Defaults are designed to be sensible for OSS users (USD / en-US). A user
 * who prefers another base currency or locale sets it once via
 * `finsight config set base-currency CNY` and never touches it again.
 */
export interface FinsightConfig {
  /** Currency every cross-currency calculation is reduced to. Defaults to USD. */
  base_currency?: string;
  /** Intl locale used for number / currency formatting. Defaults to en-US. */
  display_locale?: string;
  /** Language for asset-class / account-type / transaction labels. Defaults to en. */
  labels_language?: string;
  /** Vault ledger directory; undefined means ledger feature is disabled. */
  ledger_dir?: string;
  /** Override the SQLite path; default = ~/.finsight/data/finsight.db */
  db_path?: string;
}

export const DEFAULTS: Required<Omit<FinsightConfig, "ledger_dir" | "db_path">> = {
  base_currency: "USD",
  display_locale: "en-US",
  labels_language: "en",
};

/**
 * Config dir resolution honors `FINSIGHT_CONFIG_DIR` env, falling back to
 * `~/.finsight/`. The env override is read on every call (not cached at
 * import time) so test suites and multi-profile workflows can switch
 * configs without restarting the process.
 */
function resolveConfigDir(): string {
  const envDir = process.env.FINSIGHT_CONFIG_DIR;
  if (envDir && envDir.trim().length > 0) return envDir;
  return path.join(homedir(), ".finsight");
}

function resolveConfigPath(): string {
  return path.join(resolveConfigDir(), "config.json");
}

export function configDir(): string {
  return resolveConfigDir();
}

export function configPath(): string {
  return resolveConfigPath();
}

export function readConfig(): FinsightConfig {
  const p = resolveConfigPath();
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8")) as FinsightConfig;
  } catch {
    return {};
  }
}

export function writeConfig(cfg: FinsightConfig): void {
  mkdirSync(resolveConfigDir(), { recursive: true });
  writeFileSync(resolveConfigPath(), `${JSON.stringify(cfg, null, 2)}\n`);
}

/** Merge persisted config with defaults to get the full effective view. */
export function getEffectiveConfig(): Required<FinsightConfig> {
  const cfg = readConfig();
  return {
    base_currency: cfg.base_currency ?? DEFAULTS.base_currency,
    display_locale: cfg.display_locale ?? DEFAULTS.display_locale,
    labels_language: cfg.labels_language ?? DEFAULTS.labels_language,
    ledger_dir: cfg.ledger_dir ?? "",
    db_path: cfg.db_path ?? "",
  };
}

/** Convenience accessor — what's the active base currency? */
export function getBaseCurrency(): string {
  return readConfig().base_currency ?? DEFAULTS.base_currency;
}

export function getDisplayLocale(): string {
  return readConfig().display_locale ?? DEFAULTS.display_locale;
}

export function getLabelsLanguage(): string {
  return readConfig().labels_language ?? DEFAULTS.labels_language;
}

/** Resolve the active ledger directory, or undefined when disabled. */
export function getLedgerDir(): string | undefined {
  return readConfig().ledger_dir;
}

export function isLedgerConfigured(): boolean {
  return getLedgerDir() != null;
}

/** Resolve the SQLite path. Honors FINSIGHT_DB_PATH env, then config, then default. */
export function getDbPath(): string {
  const envPath = process.env.FINSIGHT_DB_PATH;
  if (envPath && envPath.trim().length > 0) return envPath;
  const cfg = readConfig();
  if (cfg.db_path && cfg.db_path.trim().length > 0) return cfg.db_path;
  return path.join(resolveConfigDir(), "data", "finsight.db");
}

/** A whitelist of keys writable via `finsight config set`. */
export const CONFIG_KEYS = [
  "base-currency",
  "display-locale",
  "labels-language",
  "ledger-dir",
  "db-path",
] as const;
export type ConfigKey = (typeof CONFIG_KEYS)[number];

const KEY_TO_FIELD: Record<ConfigKey, keyof FinsightConfig> = {
  "base-currency": "base_currency",
  "display-locale": "display_locale",
  "labels-language": "labels_language",
  "ledger-dir": "ledger_dir",
  "db-path": "db_path",
};

export function setConfigKey(key: ConfigKey, value: string): void {
  const cfg = readConfig();
  cfg[KEY_TO_FIELD[key]] = value;
  writeConfig(cfg);
}

export function getConfigKey(key: ConfigKey): string {
  const cfg = readConfig();
  const v = cfg[KEY_TO_FIELD[key]];
  return v ?? "";
}
