import { eq, desc } from "drizzle-orm";
import { ulid } from "ulid";
import { targets } from "../db/schema.js";
import type { AppDatabase } from "../db/connection.js";
import {
  ASSET_CLASSES,
  assetClassLabel,
  getNetWorthByAssetClass,
  type AssetClass,
} from "./asset-class.js";

export interface TargetAllocation {
  asset_class: AssetClass;
  weight: number;
  /** Optional min weight before the row counts as "under target". */
  min?: number;
  /** Optional max weight before the row counts as "over target". */
  max?: number;
}

export interface TargetSet {
  id: string;
  name: string;
  is_active: boolean;
  allocations: TargetAllocation[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTargetInput {
  name: string;
  allocations: TargetAllocation[];
  notes?: string;
  is_active?: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

function rowToTarget(r: typeof targets.$inferSelect): TargetSet {
  return {
    id: r.id,
    name: r.name,
    is_active: r.is_active === 1,
    allocations: JSON.parse(r.allocations) as TargetAllocation[],
    notes: r.notes,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function validateAllocations(rows: TargetAllocation[]): void {
  if (rows.length === 0) {
    throw new Error("At least one allocation row is required");
  }
  for (const r of rows) {
    if (!ASSET_CLASSES.includes(r.asset_class)) {
      throw new Error(
        `Unknown asset_class: ${r.asset_class}. Must be one of: ${ASSET_CLASSES.join(", ")}`,
      );
    }
    if (r.weight < 0 || r.weight > 1) {
      throw new Error(
        `Weight for ${r.asset_class} must be in [0, 1], got ${r.weight}`,
      );
    }
  }
  const total = rows.reduce((s, r) => s + r.weight, 0);
  if (Math.abs(total - 1) > 0.01) {
    throw new Error(
      `Weights must sum to 1.0 (±0.01), got ${total.toFixed(4)}`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  CRUD
// ─────────────────────────────────────────────────────────────────────────────

export function listTargets(db: AppDatabase): TargetSet[] {
  const rows = db
    .select()
    .from(targets)
    .orderBy(desc(targets.is_active), desc(targets.updated_at))
    .all();
  return rows.map(rowToTarget);
}

export function getTarget(db: AppDatabase, id: string): TargetSet | null {
  const r = db.select().from(targets).where(eq(targets.id, id)).get();
  return r ? rowToTarget(r) : null;
}

export function getActiveTarget(db: AppDatabase): TargetSet | null {
  const r = db
    .select()
    .from(targets)
    .where(eq(targets.is_active, 1))
    .get();
  return r ? rowToTarget(r) : null;
}

export function createTarget(
  db: AppDatabase,
  input: CreateTargetInput,
): TargetSet {
  validateAllocations(input.allocations);
  const id = ulid();
  const now = nowIso();
  const makeActive = input.is_active === true;
  if (makeActive) {
    db.update(targets).set({ is_active: 0, updated_at: now }).run();
  }
  db.insert(targets)
    .values({
      id,
      name: input.name,
      is_active: makeActive ? 1 : 0,
      allocations: JSON.stringify(input.allocations),
      notes: input.notes ?? null,
      created_at: now,
      updated_at: now,
    })
    .run();
  return getTarget(db, id)!;
}

export function updateTarget(
  db: AppDatabase,
  id: string,
  patch: Partial<CreateTargetInput>,
): TargetSet {
  const cur = getTarget(db, id);
  if (!cur) throw new Error(`Target not found: ${id}`);
  if (patch.allocations) validateAllocations(patch.allocations);
  const now = nowIso();
  const upd: Record<string, unknown> = { updated_at: now };
  if (patch.name !== undefined) upd.name = patch.name;
  if (patch.allocations !== undefined)
    upd.allocations = JSON.stringify(patch.allocations);
  if (patch.notes !== undefined) upd.notes = patch.notes;
  db.update(targets).set(upd).where(eq(targets.id, id)).run();
  return getTarget(db, id)!;
}

export function setActiveTarget(db: AppDatabase, id: string): TargetSet {
  const cur = getTarget(db, id);
  if (!cur) throw new Error(`Target not found: ${id}`);
  const now = nowIso();
  db.update(targets).set({ is_active: 0, updated_at: now }).run();
  db.update(targets)
    .set({ is_active: 1, updated_at: now })
    .where(eq(targets.id, id))
    .run();
  return getTarget(db, id)!;
}

export function deleteTarget(db: AppDatabase, id: string): void {
  db.delete(targets).where(eq(targets.id, id)).run();
}

// ─────────────────────────────────────────────────────────────────────────────
//  Gap analysis
// ─────────────────────────────────────────────────────────────────────────────

export type GapStatus = "under" | "over" | "on_target";

export interface TargetGap {
  asset_class: AssetClass;
  label: string;
  target_weight: number;
  current_weight: number;
  current_value_base: number;
  target_value_base: number;
  /** current_weight - target_weight (positive = over, negative = under). */
  gap_weight: number;
  /** current - target value, in base currency (positive = need to sell). */
  gap_value_base: number;
  status: GapStatus;
}

export interface TargetCheckResult {
  target_id: string;
  target_name: string;
  total_base: number;
  base_currency: string;
  gaps: TargetGap[];
  /** Largest |gap_weight| across all rows, as a friendly health metric. */
  max_drift: number;
}

/**
 * Compare current allocation against a target. Default tolerance for "on
 * target" is ±2 percentage points on the weight (overridden per-row by
 * the `min`/`max` fields).
 */
export function checkTarget(
  db: AppDatabase,
  options?: { target_id?: string; tolerance?: number; language?: string },
): TargetCheckResult | null {
  const tol = options?.tolerance ?? 0.02;
  const target = options?.target_id
    ? getTarget(db, options.target_id)
    : getActiveTarget(db);
  if (!target) return null;

  const nw = getNetWorthByAssetClass(db, options?.language);
  const currentByClass = new Map<AssetClass, number>();
  for (const b of nw.buckets) currentByClass.set(b.asset_class, b.value_base);

  const gaps: TargetGap[] = target.allocations.map((row) => {
    const currentValue = currentByClass.get(row.asset_class) ?? 0;
    const currentWeight = nw.total_base > 0 ? currentValue / nw.total_base : 0;
    const targetValue = row.weight * nw.total_base;
    const gapWeight = currentWeight - row.weight;
    const gapValue = currentValue - targetValue;
    const lowBound = row.min ?? row.weight - tol;
    const highBound = row.max ?? row.weight + tol;
    const status: GapStatus =
      currentWeight < lowBound
        ? "under"
        : currentWeight > highBound
          ? "over"
          : "on_target";
    return {
      asset_class: row.asset_class,
      label: assetClassLabel(row.asset_class, options?.language),
      target_weight: row.weight,
      current_weight: currentWeight,
      current_value_base: currentValue,
      target_value_base: targetValue,
      gap_weight: gapWeight,
      gap_value_base: gapValue,
      status,
    };
  });

  // Surface untargeted classes that hold real value (e.g. has 5% "other" but
  // didn't appear in target → effectively a "should be 0" rule).
  const targetedClasses = new Set(target.allocations.map((a) => a.asset_class));
  for (const b of nw.buckets) {
    if (targetedClasses.has(b.asset_class)) continue;
    if (b.value_base === 0) continue;
    const currentWeight = nw.total_base > 0 ? b.value_base / nw.total_base : 0;
    gaps.push({
      asset_class: b.asset_class,
      label: assetClassLabel(b.asset_class, options?.language),
      target_weight: 0,
      current_weight: currentWeight,
      current_value_base: b.value_base,
      target_value_base: 0,
      gap_weight: currentWeight,
      gap_value_base: b.value_base,
      status: currentWeight > tol ? "over" : "on_target",
    });
  }

  gaps.sort((a, b) => Math.abs(b.gap_weight) - Math.abs(a.gap_weight));
  const maxDrift = gaps.length ? Math.abs(gaps[0]!.gap_weight) : 0;
  return {
    target_id: target.id,
    target_name: target.name,
    total_base: nw.total_base,
    base_currency: nw.base_currency,
    gaps,
    max_drift: maxDrift,
  };
}
