import { Command } from "commander";
import chalk from "chalk";
import {
  listTargets,
  getTarget,
  getActiveTarget,
  createTarget,
  updateTarget,
  setActiveTarget,
  deleteTarget,
  checkTarget,
  ASSET_CLASSES,
  type TargetAllocation,
  type AssetClass,
} from "@finsight/core";
import { initDb } from "../utils/config.js";
import {
  createTable,
  formatCurrency,
  colorPercent,
  printSuccess,
} from "../utils/display.js";
import { emitJson, fail, ExitCode } from "../utils/exit.js";

export const targetCmd = new Command("target").description(
  "Manage target asset-class allocations and check drift vs current portfolio",
);

/**
 * Parse `--alloc us-stock=0.3,a-stock=0.2,fund=0.2,cash=0.2,crypto=0.1`
 * into TargetAllocation[].
 */
function parseAlloc(s: string): TargetAllocation[] {
  return s.split(",").map((kv) => {
    const [cls, w] = kv.trim().split("=");
    if (!cls || w == null) throw new Error(`Invalid allocation entry: "${kv}"`);
    if (!ASSET_CLASSES.includes(cls as AssetClass)) {
      throw new Error(
        `Unknown asset_class: ${cls}. Must be one of: ${ASSET_CLASSES.join(", ")}`,
      );
    }
    const weight = Number(w);
    if (!Number.isFinite(weight)) {
      throw new Error(`Invalid weight for ${cls}: ${w}`);
    }
    return { asset_class: cls as AssetClass, weight };
  });
}

function resolveTarget(db: ReturnType<typeof initDb>, idInput: string) {
  const direct = getTarget(db, idInput);
  if (direct) return direct;
  return listTargets(db).find((t) => t.id.endsWith(idInput)) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  list
// ─────────────────────────────────────────────────────────────────────────────

targetCmd
  .command("list")
  .description("List all target allocations")
  .option("--json", "Emit JSON")
  .action((opts) => {
    const db = initDb();
    const rows = listTargets(db);
    if (opts.json) {
      emitJson({ count: rows.length, targets: rows });
      process.exit(ExitCode.OK);
    }
    if (rows.length === 0) {
      console.log("No targets defined. Try `finsight target add --help`.");
      return;
    }
    const t = createTable(["Active", "Name", "Allocations", "ID"]);
    for (const r of rows) {
      const summary = r.allocations
        .map((a) => `${a.asset_class}=${(a.weight * 100).toFixed(0)}%`)
        .join(" ");
      t.push([r.is_active ? "✓" : "", r.name, summary, r.id.slice(-12)]);
    }
    console.log(t.toString());
  });

// ─────────────────────────────────────────────────────────────────────────────
//  show
// ─────────────────────────────────────────────────────────────────────────────

targetCmd
  .command("show")
  .description("Show one target in full (defaults to active)")
  .argument("[id]", "Target id (or suffix); defaults to active target")
  .option("--json", "Emit JSON")
  .action((idInput, opts) => {
    const db = initDb();
    const target = idInput ? resolveTarget(db, idInput) : getActiveTarget(db);
    if (!target) {
      fail("NOT_FOUND", idInput ? `Target not found: ${idInput}` : "No active target", {
        json: opts.json,
        hint: "Try `finsight target add` first",
      });
    }
    if (opts.json) {
      emitJson(target);
      process.exit(ExitCode.OK);
    }
    console.log();
    console.log(chalk.bold(`  ${target.name}${target.is_active ? chalk.green(" · active") : ""}`));
    console.log(chalk.dim(`  ${target.id}`));
    console.log();
    const t = createTable(["Asset class", "Weight", "Min", "Max"]);
    for (const a of target.allocations) {
      t.push([
        a.asset_class,
        `${(a.weight * 100).toFixed(1)}%`,
        a.min != null ? `${(a.min * 100).toFixed(1)}%` : "—",
        a.max != null ? `${(a.max * 100).toFixed(1)}%` : "—",
      ]);
    }
    console.log(t.toString());
    if (target.notes) console.log(chalk.dim(`\n  ${target.notes}`));
  });

// ─────────────────────────────────────────────────────────────────────────────
//  add
// ─────────────────────────────────────────────────────────────────────────────

targetCmd
  .command("add")
  .description("Create a target allocation")
  .requiredOption("--name <n>", "Short name (e.g. 'balanced-2026')")
  .requiredOption(
    "--alloc <pairs>",
    "Comma-separated class=weight pairs (e.g. us-stock=0.3,a-stock=0.2,cash=0.2,fund=0.2,crypto=0.1)",
  )
  .option("--notes <text>", "Notes / rationale")
  .option("--active", "Mark this target as the active one")
  .option("--json", "Emit JSON")
  .action((opts) => {
    const db = initDb();
    try {
      const target = createTarget(db, {
        name: opts.name,
        allocations: parseAlloc(opts.alloc),
        notes: opts.notes,
        is_active: !!opts.active,
      });
      if (opts.json) {
        emitJson({ ok: true, target });
        process.exit(ExitCode.OK);
      }
      printSuccess(`Target created: ${target.id.slice(-12)} (${target.name})`);
      if (target.is_active) console.log(chalk.dim("  → marked as active"));
    } catch (e) {
      fail("USER_ERROR", e instanceof Error ? e.message : String(e), { json: opts.json });
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
//  use — set active
// ─────────────────────────────────────────────────────────────────────────────

targetCmd
  .command("use")
  .description("Mark a target as the active one")
  .argument("<id>", "Target id (or suffix)")
  .option("--json", "Emit JSON")
  .action((idInput, opts) => {
    const db = initDb();
    const target = resolveTarget(db, idInput);
    if (!target) fail("NOT_FOUND", `Target not found: ${idInput}`, { json: opts.json });
    const upd = setActiveTarget(db, target.id);
    if (opts.json) {
      emitJson({ ok: true, target: upd });
      process.exit(ExitCode.OK);
    }
    printSuccess(`Activated: ${upd.name} (${upd.id.slice(-12)})`);
  });

// ─────────────────────────────────────────────────────────────────────────────
//  edit
// ─────────────────────────────────────────────────────────────────────────────

targetCmd
  .command("edit")
  .description("Update fields on an existing target")
  .argument("<id>", "Target id (or suffix)")
  .option("--name <n>")
  .option("--alloc <pairs>", "Replace allocations (comma-separated)")
  .option("--notes <text>")
  .option("--json", "Emit JSON")
  .action((idInput, opts) => {
    const db = initDb();
    const target = resolveTarget(db, idInput);
    if (!target) fail("NOT_FOUND", `Target not found: ${idInput}`, { json: opts.json });
    try {
      const upd = updateTarget(db, target.id, {
        name: opts.name,
        allocations: opts.alloc != null ? parseAlloc(opts.alloc) : undefined,
        notes: opts.notes,
      });
      if (opts.json) {
        emitJson({ ok: true, target: upd });
        process.exit(ExitCode.OK);
      }
      printSuccess(`Updated ${target.id.slice(-12)}`);
    } catch (e) {
      fail("USER_ERROR", e instanceof Error ? e.message : String(e), { json: opts.json });
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
//  delete
// ─────────────────────────────────────────────────────────────────────────────

targetCmd
  .command("delete")
  .description("Delete a target permanently")
  .argument("<id>", "Target id (or suffix)")
  .option("--yes", "Skip confirmation")
  .option("--json", "Emit JSON")
  .action((idInput, opts) => {
    const db = initDb();
    const target = resolveTarget(db, idInput);
    if (!target) fail("NOT_FOUND", `Target not found: ${idInput}`, { json: opts.json });
    if (!opts.yes && !opts.json) {
      process.stderr.write(
        chalk.yellow(`⚠ delete target "${target.name}"? Run with --yes.\n`),
      );
      process.exit(ExitCode.USER_ERROR);
    }
    deleteTarget(db, target.id);
    if (opts.json) {
      emitJson({ ok: true });
      process.exit(ExitCode.OK);
    }
    printSuccess(`Deleted ${target.id.slice(-12)}`);
  });

// ─────────────────────────────────────────────────────────────────────────────
//  check — gap analysis
// ─────────────────────────────────────────────────────────────────────────────

targetCmd
  .command("check")
  .description("Show gap between current allocation and target (default: active)")
  .argument("[id]", "Target id (or suffix); defaults to active")
  .option("--tolerance <pct>", "Tolerance fraction for on_target (default 0.02 = 2pp)", "0.02")
  .option("--json", "Emit JSON")
  .action((idInput, opts) => {
    const db = initDb();
    const targetId = idInput ? resolveTarget(db, idInput)?.id : undefined;
    if (idInput && !targetId) {
      fail("NOT_FOUND", `Target not found: ${idInput}`, { json: opts.json });
    }
    const result = checkTarget(db, {
      target_id: targetId,
      tolerance: Number(opts.tolerance),
    });
    if (!result) {
      fail("NOT_FOUND", "No active target. Run `finsight target add --active` first.", {
        json: opts.json,
      });
    }
    if (opts.json) {
      emitJson(result);
      // exit 2 (DATA_CONFLICT) if anything off-target — AI-friendly signal
      const offTarget = result.gaps.some((g) => g.status !== "on_target");
      process.exit(offTarget ? ExitCode.DATA_CONFLICT : ExitCode.OK);
    }
    console.log();
    console.log(chalk.bold(`  Target: ${result.target_name}`));
    console.log(
      chalk.dim(
        `  Total: ${formatCurrency(result.total_base, result.base_currency)} · max drift ${(result.max_drift * 100).toFixed(1)}pp`,
      ),
    );
    console.log();
    const t = createTable(["Asset class", "Target", "Current", "Δ%", "Δ value", "Status"]);
    for (const g of result.gaps) {
      const statusStr =
        g.status === "on_target"
          ? chalk.green("on")
          : g.status === "under"
            ? chalk.yellow("under")
            : chalk.red("over");
      t.push([
        g.label,
        `${(g.target_weight * 100).toFixed(1)}%`,
        `${(g.current_weight * 100).toFixed(1)}%`,
        colorPercent(g.gap_weight),
        formatCurrency(g.gap_value_base, result.base_currency),
        statusStr,
      ]);
    }
    console.log(t.toString());
    console.log();
    const offTarget = result.gaps.some((g) => g.status !== "on_target");
    process.exit(offTarget ? ExitCode.DATA_CONFLICT : ExitCode.OK);
  });
