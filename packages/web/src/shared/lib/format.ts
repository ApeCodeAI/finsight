/**
 * [INPUT]: shared/lib/config (runtime config from /api/config)
 * [OUTPUT]: formatCurrency / formatPercent / formatNumber / signed / pnlClass
 * [POS]: shared/lib — 所有 view 组件展示数字时都走这里
 * [RUNTIME]: client
 * [PROTOCOL]: Locale + base currency 从 /api/config 拉的运行时 config 读，不再硬编码。
 *             新增格式时优先加在此处，不要在组件里散落 Intl.NumberFormat。
 */
import { getConfig } from "./config";

/**
 * Symbol overrides for currencies `Intl.NumberFormat` doesn't accept as ISO
 * 4217 codes (notably stablecoins and crypto). The number is formatted with
 * the locale's default decimal grouping; the symbol or code is prefixed.
 */
const SYMBOL_OVERRIDES: Record<string, string> = {
  USDT: "$",
  USDC: "$",
  BTC: "₿",
  ETH: "Ξ",
  SOL: "◎",
};

/** Try a real Intl currency format; return null when the code isn't ISO. */
function tryIntlCurrency(
  locale: string,
  currency: string,
  amount: number,
): string | null {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return null;
  }
}

function decimalFormat(locale: string, amount: number, digits = 2): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount);
}

/**
 * Format a monetary amount.
 *
 * Strategy:
 *   1. Try `Intl.NumberFormat({ style: "currency", currency })`.
 *   2. If that throws (non-ISO code like USDT / BTC), prefix the value with
 *      the symbol override (or the bare code) and let the locale handle the
 *      number grouping.
 */
export function formatCurrency(amount: number, currency?: string): string {
  const cfg = getConfig();
  const ccy = currency ?? cfg.base_currency;
  const intl = tryIntlCurrency(cfg.display_locale, ccy, amount);
  if (intl != null) return intl;
  const symbol = SYMBOL_OVERRIDES[ccy] ?? `${ccy} `;
  const formatted = decimalFormat(cfg.display_locale, Math.abs(amount));
  // For codes with a non-letter symbol (₿, $) BTC's per-coin price needs more
  // precision than 2 decimals; allow up to 6 when the magnitude is small.
  const refined =
    Math.abs(amount) < 1
      ? decimalFormat(cfg.display_locale, Math.abs(amount), 6)
      : formatted;
  return amount < 0 ? `-${symbol}${refined}` : `${symbol}${refined}`;
}

export function formatPercent(ratio: number): string {
  return new Intl.NumberFormat(getConfig().display_locale, {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(ratio);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat(getConfig().display_locale, {
    maximumFractionDigits: 2,
  }).format(n);
}

export function signed(n: number): string {
  return n > 0 ? `+${formatNumber(n)}` : formatNumber(n);
}

export function signedCurrency(n: number, currency?: string): string {
  const formatted = formatCurrency(Math.abs(n), currency);
  return n > 0 ? `+${formatted}` : n < 0 ? `−${formatted}` : formatted;
}

export function pnlClass(n: number): string {
  if (n > 0) return "text-success";
  if (n < 0) return "text-danger";
  return "text-muted";
}
