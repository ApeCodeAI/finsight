/**
 * [INPUT]: react useState, react-router-dom useLocation, lucide-react Menu, ./sidebar (MobileNav)
 * [OUTPUT]: <Header /> — 顶部 breadcrumb + 移动端 hamburger 触发抽屉式导航
 * [POS]: shared/layout
 * [RUNTIME]: client
 * [PROTOCOL]: 加搜索 / 命令面板需在此挂载；mobile drawer 状态本地持有，不进 router
 */
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { MobileNav } from "./sidebar";

const ROUTE_LABEL: Record<string, string> = {
  "": "Overview",
  accounts: "账户",
  symbols: "标的",
  positions: "持仓",
  snapshots: "快照",
  analytics: "分析",
  decisions: "决策",
  targets: "目标",
  performance: "表现",
};

export function Header() {
  const { pathname } = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const segments = pathname.split("/").filter(Boolean);
  const label = segments.length === 0
    ? ROUTE_LABEL[""]
    : (ROUTE_LABEL[segments[0]] ?? segments[0]);

  return (
    <>
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6 md:px-10">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setNavOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground hover:bg-secondary md:hidden"
          >
            <Menu className="size-5" />
          </button>
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
              /{segments.join("/") || ""}
            </span>
            <h1 className="font-display text-base font-semibold leading-none sm:text-lg">
              {label}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted sm:text-[11px]">
            2026 · CNY
          </span>
        </div>
      </header>
      <MobileNav open={navOpen} onClose={() => setNavOpen(false)} />
    </>
  );
}
