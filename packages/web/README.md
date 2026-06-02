# @finsight/web

Vite 7 SPA + Hono API。是 FinSight 的 dashboard。

## 运行

```bash
# 在 finsight 仓库根目录
pnpm install

# 起 web（vite + hono 两个进程）
pnpm --filter @finsight/web dev
# 或者
finsight web   # 通过 CLI 拉起
```

UI: <http://localhost:3210>
API: <http://localhost:3211/api>

## 架构

```
packages/web/
├── server/
│   └── index.ts            ← Hono :3211，唯一接触 @finsight/core 的入口
├── src/
│   ├── main.tsx
│   ├── routes.tsx
│   ├── modules/
│   │   ├── view/           ← 看清类：overview / account / position / snapshot / analytics
│   │   └── decision/       ← 决策类：占位中
│   ├── shared/
│   │   ├── ui/             ← shadcn 原子（手写，可继续 pnpm dlx shadcn add）
│   │   ├── layout/         ← AppShell / Sidebar / Header / PageShell
│   │   ├── hooks/          ← useApi
│   │   ├── lib/            ← cn / format / fetcher
│   │   └── styles/         ← tokens.css (open-design dashboard) + globals.css
│   └── data/               ← domain 无关字典（账户类型 / 货币）
├── DESIGN.md               ← open-design dashboard 视觉规范
├── DESIGN.components.html  ← 视觉对照
├── CLAUDE.md               ← 给 agent 的铁律
├── components.json         ← shadcn 配置
├── vite.config.ts          ← dev 模式 /api proxy → :3211
└── tailwind.config.ts      ← Tailwind v4 (通过 @theme 映射 tokens)
```

## GEB 分型

每个 `.ts(x)` 文件以 5 行协议头注释开头：`[INPUT]/[OUTPUT]/[POS]/[RUNTIME]/[PROTOCOL]`。
每个 domain（view/<x>）都是同形态：`page.tsx + data.ts + sections/`。
详见 `CLAUDE.md`。
