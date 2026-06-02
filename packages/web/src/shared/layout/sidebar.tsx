/**
 * [INPUT]: react-router-dom NavLink, lucide-react 图标, cn
 * [OUTPUT]: <Sidebar /> 桌面左侧导航 + <MobileNav open onClose /> 手机抽屉
 * [POS]: shared/layout
 * [RUNTIME]: client
 * [PROTOCOL]: 新增 domain 路由需同步 NAV_ITEMS（桌面 + 手机共用同一份）
 */
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Wallet,
  TrendingUp,
  Tag,
  CalendarClock,
  PieChart,
  NotebookPen,
  Target,
  LineChart,
  X,
} from "lucide-react";
import { cn } from "@/shared/lib/cn";

const NAV_ITEMS = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/accounts", label: "账户", icon: Wallet },
  { to: "/symbols", label: "标的", icon: Tag },
  { to: "/positions", label: "持仓", icon: TrendingUp },
  { to: "/snapshots", label: "快照", icon: CalendarClock },
  { to: "/analytics", label: "分析", icon: PieChart },
  { to: "/performance", label: "表现", icon: LineChart },
  { to: "/targets", label: "目标", icon: Target },
  { to: "/decisions", label: "决策", icon: NotebookPen },
];

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-border bg-card md:flex">
      <SidebarBrand />
      <SidebarNav />
      <div className="border-t border-border px-5 py-4 text-[11px] font-mono uppercase tracking-widest text-muted">
        v0.2 · localhost
      </div>
    </aside>
  );
}

export function MobileNav({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 md:hidden">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close navigation"
        className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Drawer */}
      <aside className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-border bg-card shadow-2xl">
        <div className="flex h-16 items-center justify-between px-5">
          <SidebarBrand />
          <button
            type="button"
            aria-label="Close navigation"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground hover:bg-secondary"
          >
            <X className="size-5" />
          </button>
        </div>
        <SidebarNav onItemClick={onClose} />
        <div className="border-t border-border px-5 py-4 text-[11px] font-mono uppercase tracking-widest text-muted">
          v0.2 · localhost
        </div>
      </aside>
    </div>
  );
}

function SidebarBrand() {
  return (
    <div className="flex items-center gap-2 px-5 py-4 md:py-0">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary font-bold text-primary-foreground">
        F
      </div>
      <div className="flex flex-col leading-none">
        <span className="font-display text-base font-semibold">FinSight</span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
          see · decide
        </span>
      </div>
    </div>
  );
}

function SidebarNav({ onItemClick }: { onItemClick?: () => void } = {}) {
  return (
    <nav className="flex flex-1 flex-col gap-0.5 px-3 py-2">
      {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onItemClick}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-foreground hover:bg-secondary",
            )
          }
        >
          <Icon className="size-4" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
