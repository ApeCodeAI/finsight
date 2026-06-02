# shared/ui — 视觉原子

shadcn/ui new-york 风格，每个组件**独立文件、独立 [INPUT/OUTPUT/POS/RUNTIME/PROTOCOL] 头**。

## 铁律

- 这里**只放视觉原子**：Button / Card / Badge / Table / Separator / Input / Tabs / Dialog / Tooltip 等。
- **不允许** import `@/modules/*`、`@/data/*`、`@/server/*`。
- 颜色、字号、间距全部走 `tokens.css` 变量或 Tailwind 派生的 token-class。
- 新增组件优先 `pnpm dlx shadcn@latest add <name>`，再把生成文件挪到此目录，并补 GEB 头。
