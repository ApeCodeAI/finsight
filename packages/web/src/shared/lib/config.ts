/**
 * [INPUT]: /api/config (fetch once on boot)
 * [OUTPUT]: getConfig() — synchronous accessor with safe defaults
 * [POS]: shared/lib — 任何组件需要 base_currency / locale / labels 都走这里
 * [RUNTIME]: client
 * [PROTOCOL]: 必须在 main.tsx 启动时调 loadConfig() 一次；之后任何同步调用都读 cache
 */
import { apiGet } from "./fetcher";

export interface Labels {
  asset_class: Record<string, string>;
  account_type: Record<string, string>;
  transaction_type: Record<string, string>;
}

export interface RuntimeConfig {
  base_currency: string;
  display_locale: string;
  labels_language: string;
  labels: Labels;
}

const DEFAULTS: RuntimeConfig = {
  base_currency: "USD",
  display_locale: "en-US",
  labels_language: "en",
  labels: {
    asset_class: {
      "us-stock": "US Stocks",
      "hk-stock": "HK Stocks",
      "a-stock": "A-Shares",
      fund: "Funds",
      cash: "Cash",
      crypto: "Crypto",
      other: "Other",
    },
    account_type: {
      cash: "Cash",
      bank: "Bank",
      brokerage: "Brokerage",
      fund: "Fund Platform",
      exchange: "Exchange",
      crypto: "Crypto",
      business: "Business",
      other: "Other",
    },
    transaction_type: {
      buy: "Buy",
      sell: "Sell",
      deposit: "Deposit",
      withdraw: "Withdraw",
      transfer_in: "Transfer In",
      transfer_out: "Transfer Out",
      dividend: "Dividend",
      interest: "Interest",
    },
  },
};

let _config: RuntimeConfig = DEFAULTS;

export async function loadConfig(): Promise<void> {
  try {
    const remote = await apiGet<RuntimeConfig>("/api/config");
    _config = { ...DEFAULTS, ...remote, labels: { ...DEFAULTS.labels, ...remote.labels } };
  } catch {
    // Keep defaults if the API isn't reachable yet (dev startup race).
  }
}

export function getConfig(): RuntimeConfig {
  return _config;
}

export function assetClassLabel(cls: string): string {
  return _config.labels.asset_class[cls] ?? cls;
}

export function accountTypeLabelFromConfig(type: string): string {
  return _config.labels.account_type[type] ?? type;
}

export function transactionTypeLabel(type: string): string {
  return _config.labels.transaction_type[type] ?? type;
}
