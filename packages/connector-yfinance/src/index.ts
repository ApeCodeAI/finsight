/**
 * Yahoo Finance HTTP client. No API key, no SDK — talks to the public
 * `query1.finance.yahoo.com/v8/finance/chart/<symbol>` endpoint used by the
 * Yahoo website itself.
 *
 * Supported symbol shapes:
 *   - US stocks:  PDD, MSFT, BRK.B (dot → use as-is)
 *   - HK stocks:  1810.HK, 3690.HK
 *   - JP / LSE / etc: TSE codes work as <code>.T, LON: TICKER.L
 *   - Crypto:     BTC-USD, ETH-USD, SOL-USD
 *   - FX:         <FROM><TO>=X — e.g. USDCNY=X, HKDCNY=X
 *
 * Not supported here: 6-digit China onshore funds. Use a separate connector.
 */

export interface QuoteResult {
  symbol: string;
  /** Symbol as actually queried (e.g. `BTC-USD` for crypto `BTC`). */
  yf_symbol: string;
  price: number;
  currency: string;
  exchange?: string;
  /** Timestamp of the price (epoch seconds). */
  ts: number;
}

export type QuoteFailure =
  | { symbol: string; status: "unsupported"; reason: string }
  | { symbol: string; status: "error"; reason: string };

export type QuoteOutcome = ({ status: "ok" } & QuoteResult) | QuoteFailure;

const BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const USER_AGENT =
  "FinSight/0.1 (+https://github.com/ApeCodeAI/finsight) Mozilla/5.0";

/** Translate a FinSight symbol into the Yahoo Finance query symbol. */
export function toYahooSymbol(symbol: string, hint?: "crypto" | "fx"): string | null {
  if (hint === "crypto") return `${symbol}-USD`;
  // Bare 6-digit numeric code = China onshore fund → unsupported here.
  if (/^\d{6}$/.test(symbol)) return null;
  // Bare crypto codes (BTC, ETH, USDT, SOL, BNB) — auto-append -USD.
  if (/^(BTC|ETH|USDT|SOL|BNB|ADA|XRP|DOGE|TRX|LTC|DOT|AVAX|MATIC)$/i.test(symbol)) {
    return `${symbol.toUpperCase()}-USD`;
  }
  // Yahoo uses `-` not `.` for US share class separators (BRK.B → BRK-B,
  // BF.B → BF-B). It keeps `.` for exchange suffixes (1810.HK).
  if (/^[A-Z]+\.[A-Z]$/i.test(symbol)) {
    return symbol.replace(/\./g, "-");
  }
  return symbol;
}

/** Build a Yahoo FX symbol. e.g. fxSymbol("USD","CNY") → "USDCNY=X". */
export function fxSymbol(from: string, to: string): string {
  return `${from.toUpperCase()}${to.toUpperCase()}=X`;
}

async function fetchYahooChart(yfSymbol: string): Promise<{
  price: number;
  currency: string;
  exchange?: string;
  ts: number;
} | null> {
  const url = `${BASE}/${encodeURIComponent(yfSymbol)}?interval=1d&range=5d`;
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${yfSymbol}`);
  }
  const json = (await res.json()) as {
    chart?: {
      result?: Array<{
        meta?: {
          regularMarketPrice?: number;
          currency?: string;
          exchangeName?: string;
          regularMarketTime?: number;
        };
      }>;
      error?: { code: string; description: string } | null;
    };
  };
  if (json.chart?.error) {
    throw new Error(`${json.chart.error.code}: ${json.chart.error.description}`);
  }
  const meta = json.chart?.result?.[0]?.meta;
  if (!meta || typeof meta.regularMarketPrice !== "number") {
    return null;
  }
  return {
    price: meta.regularMarketPrice,
    currency: meta.currency ?? "USD",
    exchange: meta.exchangeName,
    ts: meta.regularMarketTime ?? Math.floor(Date.now() / 1000),
  };
}

/** Fetch one quote. Resolves to OK / unsupported / error. */
export async function fetchQuote(
  symbol: string,
  hint?: "crypto" | "fx",
): Promise<QuoteOutcome> {
  const yf = toYahooSymbol(symbol, hint);
  if (!yf) {
    return {
      symbol,
      status: "unsupported",
      reason: "6-digit China onshore fund — install @finsight/connector-tiantian (TODO)",
    };
  }
  try {
    const meta = await fetchYahooChart(yf);
    if (!meta) return { symbol, status: "error", reason: "No price returned" };
    return {
      status: "ok",
      symbol,
      yf_symbol: yf,
      price: meta.price,
      currency: meta.currency,
      exchange: meta.exchange,
      ts: meta.ts,
    };
  } catch (e) {
    return {
      symbol,
      status: "error",
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Batch quote fetch with a small concurrency limit so we don't hammer Yahoo.
 * Returns results in the same order as `symbols`.
 */
export async function fetchQuotes(
  symbols: Array<{ symbol: string; hint?: "crypto" | "fx" }>,
  concurrency = 4,
): Promise<QuoteOutcome[]> {
  const results: QuoteOutcome[] = new Array(symbols.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= symbols.length) return;
      results[i] = await fetchQuote(symbols[i].symbol, symbols[i].hint);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, symbols.length) }, worker);
  await Promise.all(workers);
  return results;
}

/**
 * Fetch the close price on a specific date (or the most recent prior trading
 * day if the requested date is a weekend/holiday).
 */
export async function fetchHistoricalQuote(
  symbol: string,
  date: string, // YYYY-MM-DD
  hint?: "crypto" | "fx",
): Promise<QuoteOutcome> {
  const yf = toYahooSymbol(symbol, hint);
  if (!yf) {
    return {
      symbol,
      status: "unsupported",
      reason: "6-digit China onshore fund — use connector-tiantian",
    };
  }
  // Window: target date ± 7 days, then pick the close at or before the target.
  const target = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(target.getTime())) {
    return { symbol, status: "error", reason: `Invalid date: ${date}` };
  }
  const period2 = Math.floor(target.getTime() / 1000) + 86400; // include the day
  const period1 = period2 - 86400 * 14;
  const url = `${BASE}/${encodeURIComponent(yf)}?interval=1d&period1=${period1}&period2=${period2}`;
  try {
    const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
    if (!res.ok) return { symbol, status: "error", reason: `HTTP ${res.status}` };
    const json = (await res.json()) as {
      chart?: {
        result?: Array<{
          meta?: { currency?: string; exchangeName?: string };
          timestamp?: number[];
          indicators?: { quote?: Array<{ close?: Array<number | null> }> };
        }>;
        error?: { code: string; description: string } | null;
      };
    };
    if (json.chart?.error) {
      return {
        symbol,
        status: "error",
        reason: `${json.chart.error.code}: ${json.chart.error.description}`,
      };
    }
    const result = json.chart?.result?.[0];
    const ts = result?.timestamp ?? [];
    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    // Walk back from the end to find the last bar at or before the target.
    let bestIdx = -1;
    const targetEpoch = Math.floor(target.getTime() / 1000);
    for (let i = ts.length - 1; i >= 0; i--) {
      const close = closes[i];
      if (typeof close !== "number") continue;
      if (ts[i] <= targetEpoch + 86400) {
        bestIdx = i;
        break;
      }
    }
    if (bestIdx === -1 || closes[bestIdx] == null) {
      return { symbol, status: "error", reason: `No price near ${date}` };
    }
    return {
      status: "ok",
      symbol,
      yf_symbol: yf,
      price: closes[bestIdx] as number,
      currency: result?.meta?.currency ?? "USD",
      exchange: result?.meta?.exchangeName,
      ts: ts[bestIdx],
    };
  } catch (e) {
    return {
      symbol,
      status: "error",
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Fetch a single FX rate (from → to). */
export async function fetchFx(
  from: string,
  to: string,
): Promise<{ from: string; to: string; rate: number; ts: number } | { error: string }> {
  if (from === to) return { from, to, rate: 1, ts: Math.floor(Date.now() / 1000) };
  try {
    const meta = await fetchYahooChart(fxSymbol(from, to));
    if (!meta) return { error: `No FX rate for ${from}/${to}` };
    return { from, to, rate: meta.price, ts: meta.ts };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
