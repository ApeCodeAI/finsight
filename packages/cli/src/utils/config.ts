import { getDb, getDbPath, type AppDatabase } from "@finsight/core";

let _db: AppDatabase | null = null;

/**
 * Initialize the local DB. Path resolution:
 *   1. FINSIGHT_DB_PATH env var
 *   2. config.db_path in ~/.finsight/config.json
 *   3. default: ~/.finsight/data/finsight.db
 *
 * SQLite is the sole source of truth. The optional ledger commands are explicit,
 * legacy export/import interoperability and are never run automatically.
 */
export function initDb(_opts: { skipRebuild?: boolean } = {}): AppDatabase {
  if (!_db) {
    _db = getDb(getDbPath());
  }
  return _db;
}

export { getDbPath } from "@finsight/core";
