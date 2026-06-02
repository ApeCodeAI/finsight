import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type { AppDatabase } from "../db/connection.js";
import { decisions } from "../db/schema.js";
import { eq } from "drizzle-orm";
import {
  type DecisionRow,
  listDecisions,
  createDecision,
} from "../services/decision.js";
import { decisionsDir } from "./paths.js";

/* ─────────────────────────────────────────────────────────────────────────
   Markdown ↔ Decision row

   Layout: `decisions/YYYY-MM/<ulid>.md`
   - filename = ULID (immutable identity; edits never rename the file)
   - month folder = bounded glob windows ("decisions of past 3 months")
   - frontmatter = structured metadata (parsable as YAML)
   - body = raw markdown prose (no JSON escaping)
   ─────────────────────────────────────────────────────────────────────── */

function monthOf(d: DecisionRow): string {
  // date is YYYY-MM-DD; slice the first 7 chars
  return d.date.slice(0, 7);
}

function relPathFor(d: DecisionRow): string {
  return path.join(monthOf(d), `${d.id}.md`);
}

function toMarkdown(d: DecisionRow): string {
  const frontmatter: Record<string, unknown> = {
    id: d.id,
    date: d.date,
    type: d.type,
    title: d.title,
  };
  if (d.symbols.length > 0) frontmatter.symbols = d.symbols;
  if (d.accounts.length > 0) frontmatter.accounts = d.accounts;
  if (d.transaction_id) frontmatter.transaction_id = d.transaction_id;
  if (d.conviction) frontmatter.conviction = d.conviction;
  if (d.exit_target != null) frontmatter.exit_target = d.exit_target;
  if (d.stop_loss != null) frontmatter.stop_loss = d.stop_loss;
  if (d.horizon) frontmatter.horizon = d.horizon;
  if (d.tags.length > 0) frontmatter.tags = d.tags;
  frontmatter.created_at = d.created_at;
  frontmatter.updated_at = d.updated_at;

  const yamlBlock = YAML.stringify(frontmatter, { lineWidth: 0 }).trimEnd();
  const body = d.body.trim();
  return ["---", yamlBlock, "---", "", body, ""].join("\n");
}

interface ParsedMarkdown {
  frontmatter: Record<string, unknown>;
  body: string;
}

function splitFrontmatter(text: string): ParsedMarkdown {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { frontmatter: {}, body: text };
  let frontmatter: Record<string, unknown> = {};
  try {
    frontmatter = (YAML.parse(m[1]) ?? {}) as Record<string, unknown>;
  } catch {
    // ignore malformed frontmatter; keep as note body
  }
  let body = m[2];
  // Strip the auto-generated `# title` heading if present so we don't
  // re-duplicate it on the next round-trip.
  body = body.replace(/^\s*#\s+.*?\n+/, "");
  return { frontmatter, body: body.trim() };
}

/* ─────────────────────────────────────────────────────────────────────────
   DB → vault: dump every decision to its own markdown file
   ─────────────────────────────────────────────────────────────────────── */

/**
 * Walk decisions/ recursively, returning every absolute `.md` path. Used to
 * reconcile vault state against DB truth on each dump.
 */
function listAllMdFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      out.push(...listAllMdFiles(full));
    } else if (entry.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

export function dumpDecisionsToLedger(
  db: AppDatabase,
  root: string,
): { written: number } {
  const dir = decisionsDir(root);
  mkdirSync(dir, { recursive: true });

  // Write every decision under decisions/<YYYY-MM>/<ulid>.md.
  const want = new Set<string>();
  const rows = listDecisions(db);
  for (const d of rows) {
    const rel = relPathFor(d);
    const full = path.join(dir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, toMarkdown(d));
    want.add(full);
  }
  // Reconcile: drop any .md not in the wanted set (handles DB deletes + legacy
  // flat-layout files from before this layout was introduced).
  for (const existing of listAllMdFiles(dir)) {
    if (!want.has(existing)) {
      try {
        unlinkSync(existing);
      } catch {
        // best effort
      }
    }
  }
  // Prune now-empty month folders so `ls decisions/` stays clean.
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    try {
      if (statSync(full).isDirectory() && readdirSync(full).length === 0) {
        rmdirSync(full);
      }
    } catch {
      // best effort
    }
  }
  return { written: rows.length };
}

/* ─────────────────────────────────────────────────────────────────────────
   vault → DB: parse every markdown into a decision row
   ─────────────────────────────────────────────────────────────────────── */

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.filter((x): x is string => typeof x === "string");
  }
  return [];
}

export function loadDecisionsFromLedger(
  db: AppDatabase,
  root: string,
): { loaded: number } {
  const dir = decisionsDir(root);
  if (!existsSync(dir)) return { loaded: 0 };
  // Wipe the table so the ledger files are the sole truth.
  db.delete(decisions).run();
  let count = 0;
  // Accept both new layout (decisions/YYYY-MM/<ulid>.md) and any legacy flat
  // files (decisions/*.md) — listAllMdFiles handles both transparently.
  for (const full of listAllMdFiles(dir)) {
    const f = path.basename(full);
    let raw: string;
    try {
      raw = readFileSync(full, "utf8");
    } catch {
      continue;
    }
    const { frontmatter, body } = splitFrontmatter(raw);
    const id = asString(frontmatter.id);
    const date = asString(frontmatter.date) ?? new Date().toISOString().slice(0, 10);
    const type = (asString(frontmatter.type) ?? "note") as
      | "rationale"
      | "target"
      | "stop-loss"
      | "rethink"
      | "retro"
      | "note";
    const title = asString(frontmatter.title) ?? `${date} ${type}`;
    const symbols = asStringArray(frontmatter.symbols);
    const accounts = asStringArray(frontmatter.accounts);
    const transaction_id = asString(frontmatter.transaction_id);
    const conviction = asString(frontmatter.conviction);
    const exit_target = asNumber(frontmatter.exit_target);
    const stop_loss = asNumber(frontmatter.stop_loss);
    const horizon = asString(frontmatter.horizon);
    const tags = asStringArray(frontmatter.tags);
    const created_at =
      asString(frontmatter.created_at) ?? new Date().toISOString();
    const updated_at =
      asString(frontmatter.updated_at) ?? created_at;

    const row = {
      id: id ?? `restored-${f}`,
      date,
      type,
      title,
      body,
      symbols: symbols.length > 0 ? JSON.stringify(symbols) : null,
      accounts: accounts.length > 0 ? JSON.stringify(accounts) : null,
      transaction_id: transaction_id ?? null,
      conviction: conviction ?? null,
      exit_target: exit_target ?? null,
      stop_loss: stop_loss ?? null,
      horizon: horizon ?? null,
      tags: tags.length > 0 ? JSON.stringify(tags) : null,
      created_at,
      updated_at,
    };
    db.insert(decisions).values(row).run();
    count++;
  }
  void createDecision;
  void eq;
  return { loaded: count };
}
