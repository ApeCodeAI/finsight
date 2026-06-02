/**
 * [INPUT]: react-router-dom 的 createBrowserRouter, 各 module 的 page.tsx, shared/layout/{app-shell,error-boundary}
 * [OUTPUT]: 浏览器路由表 router
 * [POS]: routes 总线 — view/decision 两宏下挂所有 domain page
 * [RUNTIME]: client
 * [PROTOCOL]: 新增 domain 需在此挂载，并在 shared/layout/sidebar 加导航条目；
 *             顶层 errorElement 接住任何 page 的同步抛错，不让整个 app 崩。
 */
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "./shared/layout/app-shell";
import { RouteErrorBoundary } from "./shared/layout/error-boundary";
import { OverviewPage } from "./modules/view/overview/page";
import { AccountListPage } from "./modules/view/account/page";
import { AccountDetailPage } from "./modules/view/account/detail-page";
import { PositionListPage } from "./modules/view/position/page";
import { SymbolListPage } from "./modules/view/symbol/page";
import { SymbolDetailPage } from "./modules/view/symbol/detail-page";
import { SnapshotListPage } from "./modules/view/snapshot/page";
import { AnalyticsPage } from "./modules/view/analytics/page";
import { DecisionListPage } from "./modules/view/decision/page";
import { DecisionDetailPage } from "./modules/view/decision/detail-page";
import { PerformancePage } from "./modules/view/performance/page";
import { TargetsPage } from "./modules/view/target/page";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: "accounts", element: <AccountListPage /> },
      { path: "accounts/:id", element: <AccountDetailPage /> },
      { path: "positions", element: <PositionListPage /> },
      { path: "symbols", element: <SymbolListPage /> },
      { path: "symbols/:symbol", element: <SymbolDetailPage /> },
      { path: "snapshots", element: <SnapshotListPage /> },
      { path: "analytics", element: <AnalyticsPage /> },
      { path: "decisions", element: <DecisionListPage /> },
      { path: "decisions/:id", element: <DecisionDetailPage /> },
      { path: "performance", element: <PerformancePage /> },
      { path: "targets", element: <TargetsPage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
