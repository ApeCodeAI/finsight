/**
 * [INPUT]: react-dom/client, RouterProvider, router (src/routes.tsx), shared/lib/config, shared/styles/globals.css
 * [OUTPUT]: 挂载 React 应用到 #root，启动 React Router（在 loadConfig() 完成之后）
 * [POS]: 应用入口
 * [RUNTIME]: client
 * [PROTOCOL]: loadConfig() 必须在 RouterProvider 渲染前调用一次；否则 format / 标签会用默认 USD/en
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./routes";
import { loadConfig } from "./shared/lib/config";
import "./shared/styles/globals.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");

loadConfig().finally(() => {
  createRoot(rootEl).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
});
