/**
 * [INPUT]: shared/lib/config (runtime labels), modules/view/position/data (AssetClass type)
 * [OUTPUT]: assetClassLabel, ASSET_CLASS_ORDER, ASSET_CLASS_COLOR, assetClassRank
 * [POS]: data/ 全局字典 — 资产类别 UI 排序 + 颜色
 * [RUNTIME]: shared
 * [PROTOCOL]: 类别标签从 server 的 /api/config 拉取，不在客户端 hardcode
 */
import { assetClassLabel as labelFromConfig } from "@/shared/lib/config";
import type { AssetClass } from "@/modules/view/position/data";

export const ASSET_CLASS_ORDER: AssetClass[] = [
  "us-stock",
  "hk-stock",
  "a-stock",
  "fund",
  "crypto",
  "cash",
  "other",
];

/** Color hint (token names from tokens.css). */
export const ASSET_CLASS_COLOR: Record<AssetClass, string> = {
  "us-stock": "var(--accent)",
  "hk-stock": "var(--warn)",
  "a-stock": "var(--danger)",
  fund: "var(--meta)",
  cash: "var(--success)",
  crypto: "color-mix(in oklab, var(--warn), white 30%)",
  other: "var(--muted)",
};

export function assetClassLabel(cls: AssetClass): string {
  return labelFromConfig(cls);
}

export function assetClassRank(cls: AssetClass): number {
  const idx = ASSET_CLASS_ORDER.indexOf(cls);
  return idx >= 0 ? idx : 99;
}
