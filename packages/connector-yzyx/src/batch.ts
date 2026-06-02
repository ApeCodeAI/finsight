import { readdirSync } from "node:fs";
import path from "node:path";
import type { AppDatabase } from "@finsight/core";
import { listAccounts } from "@finsight/core";
import { importYouzhiyouhang } from "./import.js";

/**
 * Default mapping table for chaofa's vault exports.
 * Pass `mappings` to `planYzyxBatch` / `applyYzyxBatch` to override.
 *
 * Keys are substrings expected in the xlsx filename; values are the canonical
 * account names already created via the user's vault YAML.
 */
export const YZYX_FILENAME_TO_ACCOUNT: Record<string, string> = {
  币安炒币: "币安",
  富途长钱: "富途长钱账户",
  同花顺股票: "同花顺账户",
  长钱账户: "雪球长钱账户",
  长桥股票: "长桥股票",
  支付宝基金: "支付宝基金",
};

export interface YzyxBatchEntry {
  file: string;
  matched_substr: string | null;
  account_name: string | null;
  account_id: string | null;
}

export interface YzyxBatchPlan {
  directory: string;
  entries: YzyxBatchEntry[];
}

export interface YzyxBatchResult {
  directory: string;
  results: Array<{
    file: string;
    account_name: string | null;
    snapshots_created: number;
    snapshots_skipped: number;
    transactions_created: number;
    transactions_skipped: number;
    error?: string;
  }>;
}

function findFileAccountMapping(
  filename: string,
): { substr: string; accountName: string } | null {
  for (const [substr, accountName] of Object.entries(YZYX_FILENAME_TO_ACCOUNT)) {
    if (filename.includes(substr)) {
      return { substr, accountName };
    }
  }
  return null;
}

export function planYzyxBatch(db: AppDatabase, dir: string): YzyxBatchPlan {
  const files = readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".xlsx"))
    .sort();

  const accs = listAccounts(db, { includeInactive: true });
  const byName = new Map(accs.map((a) => [a.name, a]));

  const entries: YzyxBatchEntry[] = files.map((f) => {
    const map = findFileAccountMapping(f);
    if (!map) {
      return {
        file: f,
        matched_substr: null,
        account_name: null,
        account_id: null,
      };
    }
    const acc = byName.get(map.accountName);
    return {
      file: f,
      matched_substr: map.substr,
      account_name: map.accountName,
      account_id: acc?.id ?? null,
    };
  });

  return { directory: dir, entries };
}

export async function applyYzyxBatch(
  db: AppDatabase,
  dir: string,
  opts: { notesPrefix?: string } = {},
): Promise<YzyxBatchResult> {
  const plan = planYzyxBatch(db, dir);
  const results: YzyxBatchResult["results"] = [];

  for (const e of plan.entries) {
    if (!e.account_id) {
      results.push({
        file: e.file,
        account_name: e.account_name,
        snapshots_created: 0,
        snapshots_skipped: 0,
        transactions_created: 0,
        transactions_skipped: 0,
        error:
          e.account_name === null
            ? "no mapping for filename"
            : `account "${e.account_name}" not found (run import md first)`,
      });
      continue;
    }
    try {
      const r = await importYouzhiyouhang(db, path.join(dir, e.file), {
        accountId: e.account_id,
        preserveBalance: true, // 不要覆盖 MD 设好的 balance
        notesPrefix: opts.notesPrefix ?? "yzyx-historical:",
      });
      results.push({
        file: e.file,
        account_name: e.account_name,
        snapshots_created: r.snapshotsCreated,
        snapshots_skipped: r.snapshotsSkipped,
        transactions_created: r.transactionsCreated,
        transactions_skipped: r.transactionsSkipped,
      });
    } catch (err) {
      results.push({
        file: e.file,
        account_name: e.account_name,
        snapshots_created: 0,
        snapshots_skipped: 0,
        transactions_created: 0,
        transactions_skipped: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { directory: dir, results };
}
