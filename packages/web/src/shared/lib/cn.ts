/**
 * [INPUT]: clsx, tailwind-merge
 * [OUTPUT]: cn(...) 函数 — 合并 className，解决 Tailwind 重复 token
 * [POS]: shared/lib，shadcn 强依赖
 * [RUNTIME]: shared
 * [PROTOCOL]: 不要改名 — shadcn 生成的组件硬编码导入 cn
 */
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
