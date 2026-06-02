/**
 * [INPUT]: react-router-dom Outlet, shared/layout/sidebar, shared/layout/header
 * [OUTPUT]: <AppShell /> — 整站布局壳，所有路由的父节点
 * [POS]: shared/layout — 跨 domain 视觉骨架
 * [RUNTIME]: client
 * [PROTOCOL]: 改栅格 / 侧栏宽度 / 顶栏高度时更新本头部
 */
import { Outlet } from "react-router-dom";
import { Sidebar } from "./sidebar";
import { Header } from "./header";

export function AppShell() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header />
          <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 md:px-10">
            <div className="mx-auto w-full max-w-[var(--container-max)]">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
