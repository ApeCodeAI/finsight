/**
 * [INPUT]: shared/lib/config (runtime labels), shared/ui/badge (BadgeVariant)
 * [OUTPUT]: accountTypeLabel, accountTypeVariant
 * [POS]: data/ — domain 无关的全局字典
 * [RUNTIME]: shared
 * [PROTOCOL]: 标签从 server 的 /api/config 拉，badge variant 是 UI 决定，留在客户端
 */
import type { ComponentProps } from "react";
import type { Badge } from "@/shared/ui/badge";
import { accountTypeLabelFromConfig } from "@/shared/lib/config";

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>["variant"]>;

export const ACCOUNT_TYPE_VARIANT: Record<string, BadgeVariant> = {
  cash: "muted",
  bank: "muted",
  brokerage: "primary",
  fund: "primary",
  exchange: "warn",
  crypto: "warn",
  business: "success",
  other: "default",
};

export function accountTypeLabel(type: string): string {
  return accountTypeLabelFromConfig(type);
}

export function accountTypeVariant(type: string): BadgeVariant {
  return ACCOUNT_TYPE_VARIANT[type] ?? "default";
}
