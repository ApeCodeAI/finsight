# modules/ — 业务模块

按用途切两宏：

- `view/` 看清类：把数据可视化、让你能扫一眼判断"现在多少钱、分布如何、表现怎样"。
- `decision/` 决策类：交易日志、目标、复盘、braindump 联动。**当前阶段是占位**，只放 README。

## 每个 domain 的标准形状（GEB 自相似）

```
modules/<view|decision>/<domain>/
├── page.tsx          # 路由顶层，组合 sections，从 data.ts 取数
├── data.ts           # fetch /api/<domain> + 类型，作为本 domain 的真相源
├── sections/         # 拆成多个独立 section 组件，每个有自己的头部
└── (detail-page.tsx) # 详情页（如 account/[id]）
```

## 铁律

- `data.ts` 是本 domain 的入口数据源，**任何取数都走这里**，不直接散在组件里 fetch。
- `page.tsx` 只负责：调用 hook → loading/error 兜底 → 渲染 sections。
- `sections/` 内部只接受 props，不再 fetch。
- 跨 domain 共享类型放 `@/data/<concept>.ts`（如 currency dict），不要在 modules 之间互相 import。
