# Agents — FinSight Web

This package is a Vite 7 SPA (NOT Next.js). It serves the FinSight dashboard.

Read `CLAUDE.md` for the GEB header protocol and design rules before writing code.
Read `DESIGN.md` for the visual system (open-design `dashboard`).

- Routing: `react-router-dom` v7 (`createBrowserRouter`), defined in `src/routes.tsx`.
- Styling: Tailwind v4 + tokens from `src/shared/styles/tokens.css`.
- Data: every page fetches from `/api/*`. Backend lives in `server/index.ts` (Hono).
- shadcn config: `components.json`. Run `pnpm dlx shadcn@latest add <component>` to copy into `src/shared/ui/`.
