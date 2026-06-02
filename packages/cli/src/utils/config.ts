import { getDb, getDbPath, type AppDatabase } from "@finsight/core";

let _db: AppDatabase | null = null;

/**
 * Initialize the local DB. Path resolution:
 *   1. FINSIGHT_DB_PATH env var
 *   2. config.db_path in ~/.finsight/config.json
 *   3. default: ~/.finsight/data/finsight.db
 *
 * The vault ledger (when configured) is a daily backup, not the runtime source
 * of truth — see `finsight ledger sync` / `finsight ledger restore`.
 */
export function initDb(_opts: { skipRebuild?: boolean } = {}): AppDatabase {
  if (!_db) {
    _db = getDb(getDbPath());
  }
  return _db;
}

export { getDbPath } from "@finsight/core";
