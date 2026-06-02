/**
 * Built-in chinese-name → standard ticker map.
 *
 * Format: yfinance / Bloomberg standard
 *   US:    bare ticker (PDD, MSFT, BRK.B)
 *   HK:    4-digit + .HK (1810.HK)
 *   A 股:  6-digit + .SS / .SZ (601398.SS, 000001.SZ)
 *   基金:  6-digit code (110020) — already canonical
 *   Crypto: SYMBOL-USD or just SYMBOL (BTC, ETH, USDT, SOL)
 *
 * Override at any time via `finsight symbol rename <old> <new>`.
 */
export interface TickerEntry {
  ticker: string;
  /** Canonical display name (zh or en). */
  name: string;
  /** Currency used by the broker that reports market price. */
  quote_currency?: string;
}

export const TICKER_MAP: Record<string, TickerEntry> = {
  // ── 美股 ─────────────────────────────────────────────────────────────────
  拼多多: { ticker: "PDD", name: "拼多多 / PDD Holdings", quote_currency: "USD" },
  微软: { ticker: "MSFT", name: "Microsoft", quote_currency: "USD" },
  "伯克希尔 B": {
    ticker: "BRK.B",
    name: "Berkshire Hathaway B",
    quote_currency: "USD",
  },
  京东: { ticker: "JD", name: "京东 / JD.com", quote_currency: "USD" },
  多邻国: { ticker: "DUOL", name: "Duolingo", quote_currency: "USD" },
  理想汽车: { ticker: "LI", name: "理想汽车 / Li Auto", quote_currency: "USD" },
  霸王茶姬: { ticker: "CHA", name: "霸王茶姬 / Chagee Holdings", quote_currency: "USD" },

  // ── 港股 ─────────────────────────────────────────────────────────────────
  小米: { ticker: "1810.HK", name: "小米集团", quote_currency: "HKD" },
  美团: { ticker: "3690.HK", name: "美团", quote_currency: "HKD" },
  心动公司: { ticker: "2400.HK", name: "心动公司", quote_currency: "HKD" },

  // ── 加密（占位，待录入实际持仓时补具体单位） ───────────────────────────
  BTC: { ticker: "BTC", name: "Bitcoin", quote_currency: "USDT" },
  ETH: { ticker: "ETH", name: "Ethereum", quote_currency: "USDT" },
  USDT: { ticker: "USDT", name: "Tether USD", quote_currency: "USD" },
  SOL: { ticker: "SOL", name: "Solana", quote_currency: "USDT" },
};

/**
 * Look up by raw symbol (e.g. the Chinese name in vault MD).
 * Returns undefined if not in the map — caller should keep the original symbol.
 */
export function resolveTicker(rawSymbol: string): TickerEntry | undefined {
  return TICKER_MAP[rawSymbol];
}

/**
 * For fund codes (6 digits) we already have canonical tickers.
 * Optional friendly name lookup table — extend as needed.
 */
export const FUND_NAME_MAP: Record<string, string> = {
  "110020": "易方达沪深300ETF联接A",
  "008763": "天弘越南市场股票QDII A",
  "012348": "天弘恒生科技ETF联接QDII A",
  "100050": "富国全球债券QDII A",
  "006105": "宏利印度机会股票QDII A",
  "161725": "招商证券白酒指数LOF A",
  "017970": "摩根海外稳健配置混合QDII FOF人民币A",
  "050025": "博时标普500ETF联接A",
  "040046": "华安纳斯达克100指数A",
  "000968": "广发中证养老",
  "005313": "万家中证1000指数增强A",
  "001717": "工银前沿医疗股票",
  "000248": "汇添富中证主要消费ETF联接",
  "002656": "南方创业板ETF联接",
  "090010": "大成中证红利指数A",
  "009051": "易方达中证红利ETF联接A",
  "000191": "富国信用债券A",
};

export function resolveFundName(code: string): string | undefined {
  return FUND_NAME_MAP[code];
}
