# FinSight Web — 铁律

Vite 7 + React 19 + React Router 7 + Tailwind v4 + shadcn/ui，单页应用。
不是 Next.js。不要写 RSC / Server Action / use server / use client 之类指令。
不要写 next/link、next/router、next-intl。

## GEB 分型协议

每个 `.ts(x)` 文件顶部必须以注释块开头：

```
[INPUT]: 这个文件依赖什么（包 / 同 repo 路径 / data source）
[OUTPUT]: 这个文件对外提供什么（export / 副作用 / DOM / endpoint）
[POS]: 它在系统中的位置（哪一层、什么角色）
[RUNTIME]: server / client / shared / build-time
[PROTOCOL]: 改输入输出时更新本头部，然后检查最近 CLAUDE.md
```

## 目录分层

- `server/` Hono API，唯一接触 `@finsight/core` better-sqlite3 的地方。
- `src/modules/view/<domain>/` 看清类页面，自包含：`page.tsx + sections/ + data.ts + hooks.ts`。
- `src/modules/decision/` 决策类页面，占位中。
- `src/shared/ui/` shadcn 原子，按需复制，**不重写**。
- `src/shared/lib/` cn / fetcher / format。
- `src/shared/layout/` AppShell、Header、Sidebar，跨 domain 复用。
- `src/shared/styles/` tokens.css + globals.css，**所有颜色都从 tokens 派生**。
- `src/data/` domain 无关的常量（货币代码、账户类型字典）。

## 视觉铁律

- 颜色、间距、字号只能用 tokens.css 里的变量或 Tailwind 派生的 token-class。**禁止硬编码 `#xxxxxx` / `text-blue-500` 这类直接色值**。
- 数字一律用 `class="num"`（tabular-nums + mono）。
- 涨跌色：正用 `text-success`，负用 `text-danger`。
- 卡片只用 `.card-flat` 或 `.card-raised` 两种。

## 数据流

- 浏览器永远走 `/api/*`，不直接 import `@finsight/core`。
- `@finsight/core` 只在 `server/` 下使用。
- 取数函数都集中在每个 module 的 `data.ts`，组件不直接 fetch。

## DESIGN.md / DESIGN.components.html

- `DESIGN.md` = open-design `dashboard` 系统规范，每次改设计前先读。
- `DESIGN.components.html` = 参考组件 HTML，可作为视觉对照。
