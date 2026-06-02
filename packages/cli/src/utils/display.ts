import Table from "cli-table3";
import chalk from "chalk";
import { getBaseCurrency, getDisplayLocale } from "@finsight/core";

const CURRENCY_SYMBOLS: Record<string, string> = {
  CNY: "¥",
  USD: "$",
  HKD: "HK$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  KRW: "₩",
  USDT: "$",
};

/**
 * Format a monetary amount.
 *
 * - `currency` defaults to the configured base currency.
 * - Number locale follows config.display_locale (default en-US).
 */
export function formatCurrency(amount: number, currency?: string): string {
  const ccy = currency ?? getBaseCurrency();
  const sym = CURRENCY_SYMBOLS[ccy] ?? `${ccy} `;
  const locale = getDisplayLocale();
  const formatted = Math.abs(amount).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return amount < 0 ? `-${sym}${formatted}` : `${sym}${formatted}`;
}

export function colorPnL(amount: number, formatted?: string): string {
  const text = formatted ?? formatCurrency(amount);
  if (amount > 0) return chalk.green(text);
  if (amount < 0) return chalk.red(text);
  return text;
}

export function colorPercent(pct: number): string {
  const text = `${(pct * 100).toFixed(2)}%`;
  if (pct > 0) return chalk.green(`+${text}`);
  if (pct < 0) return chalk.red(text);
  return text;
}

export function createTable(head: string[], colWidths?: number[]): Table.Table {
  const opts: Table.TableConstructorOptions = {
    head: head.map((h) => chalk.cyan(h)),
    style: { head: [], border: [] },
  };
  if (colWidths) opts.colWidths = colWidths;
  return new Table(opts);
}

export function printSuccess(msg: string) {
  console.log(chalk.green("✓") + " " + msg);
}

export function printError(msg: string) {
  console.error(chalk.red("✗") + " " + msg);
}

export function printInfo(msg: string) {
  console.log(chalk.blue("ℹ") + " " + msg);
}
