/**
 * [INPUT]: hono, @hono/node-server, @finsight/core
 * [OUTPUT]: HTTP server (默认 :3211)，dev 模式只暴露 /api/*；prod 模式同时托管 dist/client 静态文件
 * [POS]: web 的唯一 server，浏览器所有 /api/* 请求最终汇到这里
 * [RUNTIME]: server (Node)
 * [PROTOCOL]: 新增 endpoint 时同步 packages/web/CLAUDE.md 中的数据流说明
 */
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import {
  getDb,
  listAccounts,
  getAccount,
  listPositions,
  getPosition,
  listSnapshots,
  getSnapshot,
  diffSnapshots,
  listTransactions,
  getNetWorth,
  getAllocation,
  getOverview,
  getPositionPnL,
  getFxRate,
  toBase,
  listSymbols,
  getSymbolDetail,
  classifyPosition,
  getNetWorthByAssetClass,
  getEffectiveConfig,
  getBaseCurrency,
  getDisplayLocale,
  getLabelsLanguage,
  tForLabels,
  listDecisions,
  getDecision,
  createDecision,
  updateDecision,
  deleteDecision,
  checkDecisionTriggers,
  listTransactionsNeedingRationale,
  type DecisionType,
  listTargets,
  getTarget,
  getActiveTarget,
  createTarget,
  updateTarget,
  setActiveTarget,
  deleteTarget,
  checkTarget,
  type TargetAllocation,
  getAccountPerformance,
  getAllPerformance,
} from "@finsight/core";

const PORT = Number(process.env.FINSIGHT_WEB_PORT ?? 3211);
const IS_PROD = process.env.NODE_ENV === "production";

const app = new Hono();
app.use("*", logger());
app.use("/api/*", cors());

const db = getDb();

// ── /api/config ──────────────────────────────────────────────────────────────
//  Public-safe slice of the user config + the bundled label tables. The web
//  client reads this once on boot to know the base currency, display locale,
//  and how to render asset-class / account-type / transaction-type labels.
app.get("/api/config", (c) => {
  const cfg = getEffectiveConfig();
  const labels = tForLabels(cfg.labels_language);
  return c.json({
    base_currency: cfg.base_currency,
    display_locale: cfg.display_locale,
    labels_language: cfg.labels_language,
    labels,
  });
});

// ── /api/overview ────────────────────────────────────────────────────────────
app.get("/api/overview", (c) => {
  const overview = getOverview(db);
  const netWorth = getNetWorth(db);
  const snaps = listSnapshots(db);
  const globalSnaps = snaps.filter(
    (s) => !(s.notes?.startsWith("yzyx-historical:") ?? false),
  );
  return c.json({
    ...overview,
    by_account: netWorth.byAccount,
    snapshots: globalSnaps.map((s) => ({
      id: s.id,
      date: s.snapshot_date,
      total: s.total_net_worth,
    })),
  });
});

// ── /api/accounts ────────────────────────────────────────────────────────────
app.get("/api/accounts", (c) => {
  const type = c.req.query("type");
  const accs = listAccounts(db, type ? { type } : undefined);
  const nw = getNetWorth(db);
  const accMap = new Map(nw.byAccount.map((a) => [a.id, a]));
  const enriched = accs.map((a) => {
    const stat = accMap.get(a.id);
    return {
      ...a,
      tags: a.tags ? JSON.parse(a.tags) : [],
      total_value: stat?.balance ?? a.balance,
      total_value_base: stat?.balance_base ?? a.balance,
    };
  });
  return c.json({ accounts: enriched });
});

app.get("/api/accounts/:id", (c) => {
  const id = c.req.param("id");
  const acc = getAccount(db, id);
  if (!acc) {
    return c.json({ error: "Account not found", code: "NOT_FOUND" }, 404);
  }
  const accPositions = listPositions(db, id).map((p) => {
    const value = p.current_price * p.quantity; // native ccy
    const cost = p.avg_cost * p.quantity; // native ccy
    const fx = getFxRate(db, p.currency, getBaseCurrency());
    const valueBase = value * fx;
    const costBase = cost * fx;
    return {
      ...p,
      tags: p.tags ? JSON.parse(p.tags) : [],
      market_value: value,
      cost_basis: cost,
      pnl: value - cost,
      pnl_pct: cost !== 0 ? (value - cost) / cost : 0,
      market_value_base: valueBase,
      cost_basis_base: costBase,
      pnl_base: valueBase - costBase,
      fx_to_base: fx,
    };
  });
  const positionsTotalBase = accPositions.reduce(
    (s, p) => s + p.market_value_base,
    0,
  );
  const cashBase = toBase(db, acc.balance, acc.currency);
  const accountTotalBase = cashBase + positionsTotalBase;
  const txns = listTransactions(db, { account_id: id });

  // History points for this account come from TWO sources:
  //   1. yzyx-historical:<name>  — single-account snapshots imported from xlsx
  //   2. global snapshots         — full-portfolio snapshots; we extract this
  //      account's balance from the JSON data field so the curve continues into
  //      the present (e.g. the 2026-05-28 baseline)
  const allSnaps = listSnapshots(db);
  const historicalNote = `yzyx-historical:${acc.name}`;
  const historicalPoints = allSnaps
    .filter((s) => s.notes === historicalNote)
    .map((s) => ({
      id: s.id,
      snapshot_date: s.snapshot_date,
      total_net_worth: s.total_net_worth,
      source: "historical" as const,
    }));

  const globalPoints = allSnaps
    .filter(
      (s) => !(s.notes?.startsWith("yzyx-historical:") ?? false) && s.data,
    )
    .flatMap((s) => {
      try {
        const data = JSON.parse(s.data as string) as Array<{
          account_id: string;
          balance_base?: number;
          balance?: number;
          cash_balance?: number;
        }>;
        const mine = data.find((d) => d.account_id === id);
        if (!mine) return [];
        const value = mine.balance_base ?? mine.balance ?? mine.cash_balance ?? 0;
        return [
          {
            id: s.id,
            snapshot_date: s.snapshot_date,
            total_net_worth: value,
            source: "current" as const,
          },
        ];
      } catch {
        return [];
      }
    });

  // Merge by date — when the same date appears in both, the global (current)
  // point wins because it reflects the full portfolio reality.
  const byDate = new Map<string, (typeof historicalPoints)[number] | (typeof globalPoints)[number]>();
  for (const p of historicalPoints) byDate.set(p.snapshot_date, p);
  for (const p of globalPoints) byDate.set(p.snapshot_date, p);
  const history = Array.from(byDate.values()).sort((a, b) =>
    a.snapshot_date.localeCompare(b.snapshot_date),
  );

  return c.json({
    account: { ...acc, tags: acc.tags ? JSON.parse(acc.tags) : [] },
    positions: accPositions,
    transactions: txns,
    history,
    decisions: listDecisions(db, { account: acc.id }),
    summary: {
      cash_base: cashBase,
      positions_total_base: positionsTotalBase,
      account_total_base: accountTotalBase,
    },
  });
});

// ── /api/positions ───────────────────────────────────────────────────────────
app.get("/api/positions", (c) => {
  const accountId = c.req.query("account_id");
  const accs = listAccounts(db);
  const accMap = new Map(accs.map((a) => [a.id, a]));
  const list = listPositions(db, accountId ?? undefined).map((p) => {
    const value = p.current_price * p.quantity;
    const cost = p.avg_cost * p.quantity;
    const tags = p.tags ? JSON.parse(p.tags) : [];
    const fx = getFxRate(db, p.currency, getBaseCurrency());
    return {
      ...p,
      tags,
      account_name: accMap.get(p.account_id)?.name ?? null,
      market_value: value,
      cost_basis: cost,
      pnl: value - cost,
      pnl_pct: cost !== 0 ? (value - cost) / cost : 0,
      market_value_base: value * fx,
      cost_basis_base: cost * fx,
      pnl_base: (value - cost) * fx,
      asset_class: classifyPosition({
        symbol: p.symbol,
        currency: p.currency,
        tags,
      }),
    };
  });
  return c.json({ positions: list });
});

// ── /api/symbols ─────────────────────────────────────────────────────────────
app.get("/api/symbols", (c) => {
  return c.json({ symbols: listSymbols(db) });
});

app.get("/api/symbols/:symbol", (c) => {
  const sym = decodeURIComponent(c.req.param("symbol"));
  const detail = getSymbolDetail(db, sym);
  if (!detail) {
    return c.json({ error: `Symbol not found: ${sym}`, code: "NOT_FOUND" }, 404);
  }
  // Pull transactions tied to any of this symbol's positions (cross-account).
  const positionIds = new Set(detail.legs.map((l) => l.position_id));
  const accs = listAccounts(db);
  const accNameById = new Map(accs.map((a) => [a.id, a.name]));
  const accIds = Array.from(new Set(detail.legs.map((l) => l.account_id)));
  const candidates = accIds.flatMap((aid) =>
    listTransactions(db, { account_id: aid }),
  );
  const txns = candidates
    .filter((t) => t.position_id && positionIds.has(t.position_id))
    .map((t) => ({
      ...t,
      account_name: accNameById.get(t.account_id) ?? null,
    }))
    .sort((a, b) => b.traded_at.localeCompare(a.traded_at));
  return c.json({
    ...detail,
    transactions: txns,
    decisions: listDecisions(db, { symbol: sym }),
  });
});

app.get("/api/positions/:id", (c) => {
  const pos = getPosition(db, c.req.param("id"));
  if (!pos) return c.json({ error: "Position not found", code: "NOT_FOUND" }, 404);
  const pnl = getPositionPnL(db, pos.id);
  return c.json({
    ...pos,
    tags: pos.tags ? JSON.parse(pos.tags) : [],
    pnl_summary: pnl,
  });
});

// ── /api/snapshots ───────────────────────────────────────────────────────────
const HISTORICAL_PREFIX = "yzyx-historical:";

app.get("/api/snapshots", (c) => {
  const include = c.req.query("include") ?? "global";
  const all = listSnapshots(db);
  const filtered = all
    .filter((s) =>
      include === "all" ? true : !(s.notes?.startsWith(HISTORICAL_PREFIX) ?? false),
    )
    .map((s) => ({
      id: s.id,
      snapshot_date: s.snapshot_date,
      total_net_worth: s.total_net_worth,
      notes: s.notes,
      scope: s.notes?.startsWith(HISTORICAL_PREFIX)
        ? "account-historical"
        : "global",
      created_at: s.created_at,
    }));
  return c.json({ snapshots: filtered, total: all.length, returned: filtered.length });
});

app.get("/api/snapshots/diff", (c) => {
  const a = c.req.query("a");
  const b = c.req.query("b");
  if (!a || !b) return c.json({ error: "Missing query a/b", code: "USER_ERROR" }, 400);
  try {
    return c.json(diffSnapshots(db, a, b));
  } catch (err) {
    return c.json({ error: String(err), code: "NOT_FOUND" }, 404);
  }
});

app.get("/api/snapshots/:id", (c) => {
  const s = getSnapshot(db, c.req.param("id"));
  if (!s) return c.json({ error: "Snapshot not found", code: "NOT_FOUND" }, 404);
  return c.json({ ...s, data: s.data ? JSON.parse(s.data) : [] });
});

// ── /api/analytics ───────────────────────────────────────────────────────────
app.get("/api/analytics/networth", (c) => c.json(getNetWorth(db)));
app.get("/api/analytics/allocation", (c) => c.json({ allocation: getAllocation(db) }));
app.get("/api/analytics/by-class", (c) => {
  const result = getNetWorthByAssetClass(db);
  return c.json({
    ...result,
    label_map: tForLabels().asset_class,
  });
});

// ── /api/transactions ────────────────────────────────────────────────────────
app.get("/api/transactions", (c) => {
  const account_id = c.req.query("account_id") ?? undefined;
  const typeQ = c.req.query("type") ?? undefined;
  type Filters = NonNullable<Parameters<typeof listTransactions>[1]>;
  return c.json({
    transactions: listTransactions(db, {
      account_id,
      type: typeQ as Filters["type"],
    }),
  });
});

// ── /api/decisions ───────────────────────────────────────────────────────────
app.get("/api/decisions", (c) => {
  const symbol = c.req.query("symbol") ?? undefined;
  const account = c.req.query("account") ?? undefined;
  const type = (c.req.query("type") as DecisionType | undefined) ?? undefined;
  const tag = c.req.query("tag") ?? undefined;
  const since = c.req.query("since") ?? undefined;
  const transaction_id = c.req.query("transaction_id") ?? undefined;
  return c.json({
    decisions: listDecisions(db, {
      symbol,
      account,
      type,
      tag,
      since,
      transaction_id,
    }),
  });
});

app.get("/api/decisions/alerts", (c) => {
  const triggers = checkDecisionTriggers(db);
  const pending = listTransactionsNeedingRationale(db);
  return c.json({
    triggered: triggers.filter((t) => t.triggered),
    all_thresholds: triggers,
    pending_rationale: pending,
  });
});

app.get("/api/decisions/:id", (c) => {
  const d = getDecision(db, c.req.param("id"));
  if (!d) return c.json({ error: "Decision not found", code: "NOT_FOUND" }, 404);
  return c.json(d);
});

app.post("/api/decisions", async (c) => {
  const body = (await c.req.json()) as {
    type?: DecisionType;
    title?: string;
    body?: string;
    symbols?: string[];
    accounts?: string[];
    transaction_id?: string;
    conviction?: "low" | "medium" | "high";
    exit_target?: number;
    stop_loss?: number;
    horizon?: "1m" | "3m" | "12m" | "3y";
    tags?: string[];
    date?: string;
  };
  if (!body.type) {
    return c.json({ error: "type required", code: "USER_ERROR" }, 400);
  }
  const created = createDecision(db, body as Parameters<typeof createDecision>[1]);
  return c.json({ ok: true, decision: created });
});

app.patch("/api/decisions/:id", async (c) => {
  const id = c.req.param("id");
  const existing = getDecision(db, id);
  if (!existing) {
    return c.json({ error: "Decision not found", code: "NOT_FOUND" }, 404);
  }
  const patch = (await c.req.json()) as Parameters<typeof updateDecision>[2];
  const updated = updateDecision(db, id, patch);
  return c.json({ ok: true, decision: updated });
});

app.delete("/api/decisions/:id", (c) => {
  const { deleted } = deleteDecision(db, c.req.param("id"));
  return c.json({ ok: deleted > 0, deleted });
});

// ── /api/targets ─────────────────────────────────────────────────────────────
app.get("/api/targets", (c) =>
  c.json({ targets: listTargets(db), active: getActiveTarget(db) }),
);

app.get("/api/targets/check", (c) => {
  const result = checkTarget(db);
  if (!result) return c.json({ error: "No active target", code: "NOT_FOUND" }, 404);
  return c.json(result);
});

app.get("/api/targets/:id", (c) => {
  const t = getTarget(db, c.req.param("id"));
  if (!t) return c.json({ error: "Target not found", code: "NOT_FOUND" }, 404);
  return c.json(t);
});

app.post("/api/targets", async (c) => {
  const body = (await c.req.json()) as {
    name: string;
    allocations: TargetAllocation[];
    notes?: string;
    is_active?: boolean;
  };
  try {
    return c.json({ ok: true, target: createTarget(db, body) });
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : String(e), code: "USER_ERROR" },
      400,
    );
  }
});

app.patch("/api/targets/:id", async (c) => {
  const id = c.req.param("id");
  if (!getTarget(db, id))
    return c.json({ error: "Target not found", code: "NOT_FOUND" }, 404);
  const patch = (await c.req.json()) as Parameters<typeof updateTarget>[2];
  try {
    return c.json({ ok: true, target: updateTarget(db, id, patch) });
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : String(e), code: "USER_ERROR" },
      400,
    );
  }
});

app.post("/api/targets/:id/activate", (c) => {
  const id = c.req.param("id");
  if (!getTarget(db, id))
    return c.json({ error: "Target not found", code: "NOT_FOUND" }, 404);
  return c.json({ ok: true, target: setActiveTarget(db, id) });
});

app.delete("/api/targets/:id", (c) => {
  deleteTarget(db, c.req.param("id"));
  return c.json({ ok: true });
});

// ── /api/performance ─────────────────────────────────────────────────────────
app.get("/api/performance", (c) => c.json(getAllPerformance(db)));

app.get("/api/performance/:accountId", (c) => {
  const r = getAccountPerformance(db, c.req.param("accountId"));
  if (!r) return c.json({ error: "Account not found", code: "NOT_FOUND" }, 404);
  return c.json(r);
});

// ── prod: 静态文件托管 ───────────────────────────────────────────────────────
if (IS_PROD) {
  app.use("*", serveStatic({ root: "./dist/client" }));
  app.get("*", serveStatic({ path: "./dist/client/index.html" }));
}

// ── 错误兜底 ─────────────────────────────────────────────────────────────────
app.onError((err, c) => {
  console.error("[server] uncaught:", err);
  return c.json({ error: err.message, code: "INTERNAL" }, 500);
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  // biome-ignore lint: 启动 banner
  console.log(`▲ FinSight API ready on http://localhost:${info.port}/api`);
  if (!IS_PROD) {
    console.log(`▲ Vite dev server should be on http://localhost:3210`);
  }
});
