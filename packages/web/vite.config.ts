/**
 * [INPUT]: 依赖 @vitejs/plugin-react, @tailwindcss/vite
 * [OUTPUT]: Vite 配置，dev 模式 proxy /api → Hono server (端口 3211)
 * [POS]: packages/web 根，被 vite dev / vite build 消费
 * [RUNTIME]: build-time
 * [PROTOCOL]: 改动 alias / proxy / plugin 时更新本头部
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  server: {
    port: 3210,
    // Bind to all addresses (IPv4 + IPv6) so localhost resolves regardless of
    // the OS's preferred family. Default `localhost` would only bind ::1.
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3211",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Split heavy deps so the initial bundle stays under the warning limit
        // and shared chunks cache better across deploys.
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-charts": ["recharts"],
          "vendor-ui": ["lucide-react"],
        },
      },
    },
  },
});
