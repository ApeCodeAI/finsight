/**
 * Plain-data label catalog. Two languages bundled by default (en, zh). To add
 * a language, copy the `en` block and translate. No runtime dependency.
 */

import { getLabelsLanguage } from "../config/index.js";

export type LabelLanguage = "en" | "zh";

interface LabelBundle {
  asset_class: Record<string, string>;
  account_type: Record<string, string>;
  transaction_type: Record<string, string>;
}

const BUNDLES: Record<LabelLanguage, LabelBundle> = {
  en: {
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
  zh: {
    asset_class: {
      "us-stock": "美股",
      "hk-stock": "港股",
      "a-stock": "A 股",
      fund: "基金",
      cash: "现金",
      crypto: "加密",
      other: "其他",
    },
    account_type: {
      cash: "现金",
      bank: "银行",
      brokerage: "券商",
      fund: "基金",
      exchange: "交易所",
      crypto: "加密",
      business: "项目",
      other: "其他",
    },
    transaction_type: {
      buy: "买入",
      sell: "卖出",
      deposit: "转入",
      withdraw: "转出",
      transfer_in: "内转入",
      transfer_out: "内转出",
      dividend: "分红",
      interest: "利息",
    },
  },
};

function normalizeLanguage(lang?: string): LabelLanguage {
  if (lang === "zh" || lang?.startsWith("zh-")) return "zh";
  return "en";
}

/** Get the label bundle for a language (defaults to configured language). */
export function tForLabels(language?: string): LabelBundle {
  const lang = normalizeLanguage(language ?? getLabelsLanguage());
  return BUNDLES[lang];
}

export function listLanguages(): LabelLanguage[] {
  return Object.keys(BUNDLES) as LabelLanguage[];
}
