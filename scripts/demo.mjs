#!/usr/bin/env node
/**
 * One-shot demo bootstrap:
 *   1. Build all packages (if dist is missing)
 *   2. Spin up a fresh demo vault + DB in /tmp/finsight-demo
 *   3. Load examples/seed-portfolio.{en,zh}.yaml
 *   4. Start the web dashboard
 *
 * Usage:
 *   pnpm demo          # English / USD portfolio
 *   pnpm demo zh       # Chinese / CNY portfolio
 *
 * Cleans up the demo dir on exit so a re-run is reproducible.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const demoDir = "/tmp/finsight-demo";
const demoDb = path.join(demoDir, "finsight.db");
const demoVault = path.join(demoDir, "vault");

const variant = (process.argv[2] ?? "en") === "zh" ? "zh" : "en";
const example = path.join(repoRoot, "examples", `seed-portfolio.${variant}.yaml`);
const tickersExample = path.join(repoRoot, "examples", "tickers.cn.yaml");

function log(msg) {
  process.stdout.write(`\x1b[36m›\x1b[0m ${msg}\n`);
}

function err(msg) {
  process.stderr.write(`\x1b[31m✗\x1b[0m ${msg}\n`);
}

function exec(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd: repoRoot,
    stdio: "inherit",
    ...opts,
  });
  if (res.status !== 0) {
    err(`${cmd} ${args.join(" ")} → exit ${res.status}`);
    process.exit(res.status ?? 1);
  }
}

function checkBuild() {
  const required = [
    "packages/core/dist/index.js",
    "packages/cli/dist/index.js",
    "packages/web/dist/client/index.html",
    "packages/connector-yfinance/dist/index.js",
    "packages/connector-tiantian/dist/index.js",
  ];
  return required.every((p) => existsSync(path.join(repoRoot, p)));
}

// ── 1. Build if needed ────────────────────────────────────────────────────
if (!checkBuild()) {
  log("Building packages (first run)…");
  exec("pnpm", ["-r", "build"]);
}

// ── 2. Fresh demo dir ─────────────────────────────────────────────────────
if (existsSync(demoDir)) {
  log(`Wiping previous demo at ${demoDir}`);
  rmSync(demoDir, { recursive: true, force: true });
}
mkdirSync(demoVault, { recursive: true });

// ── 3. Configure + load demo ──────────────────────────────────────────────
log("Bootstrapping demo (vault + config + seed data)…");
const env = {
  ...process.env,
  FINSIGHT_DB_PATH: demoDb,
  HOME: demoDir, // isolate ~/.finsight/config.json from your real one
};
exec("node", [
  "packages/cli/dist/index.js",
  "init",
  "--non-interactive",
  "--base-currency",
  variant === "zh" ? "CNY" : "USD",
  "--display-locale",
  variant === "zh" ? "zh-CN" : "en-US",
  "--labels-language",
  variant,
  "--ledger-dir",
  demoVault,
  "--demo",
  variant,
  "--force",
], { env });

// ── 4. Verify + show overview ─────────────────────────────────────────────
log("Demo loaded. Snapshot:");
exec("node", ["packages/cli/dist/index.js", "overview"], { env });

// ── 5. Spin up web ────────────────────────────────────────────────────────
log("Starting web dashboard at http://localhost:3210 …");
log("Press Ctrl+C to stop. The demo dir will be cleaned up automatically.");

const webProc = spawn(
  "pnpm",
  ["--filter", "@finsight/web", "dev"],
  {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...env, FINSIGHT_WEB_PORT: "3211" },
  },
);

function cleanup() {
  log(`Cleaning up ${demoDir}`);
  try {
    rmSync(demoDir, { recursive: true, force: true });
  } catch {
    // best effort
  }
  process.exit(0);
}

process.on("SIGINT", () => {
  webProc.kill("SIGINT");
  cleanup();
});
process.on("SIGTERM", () => {
  webProc.kill("SIGTERM");
  cleanup();
});
webProc.on("exit", cleanup);
