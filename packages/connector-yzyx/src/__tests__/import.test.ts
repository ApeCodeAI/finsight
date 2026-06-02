import { describe, it, expect, beforeEach } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getTestDb } from "@finsight/core";
import type { AppDatabase } from "@finsight/core";
import { importYouzhiyouhang } from "../import.js";
import { listAccounts, getAccount } from "@finsight/core";
import { listSnapshots } from "@finsight/core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(
  __dirname,
  "fixtures",
  "youzhiyouhang_sample.xlsx"
);

describe("import service — 有知有行 xlsx", () => {
  let db: AppDatabase;

  beforeEach(() => {
    db = getTestDb();
  });

  it("should import and create account from xlsx metadata", async () => {
    const result = await importYouzhiyouhang(db, FIXTURE_PATH);
    expect(result.accountName).toBe("富途长钱");
    expect(result.accountId).toHaveLength(26);

    const accs = listAccounts(db);
    expect(accs).toHaveLength(1);
    expect(accs[0].name).toBe("富途长钱");
    expect(accs[0].institution).toBe("有知有行");
  });

  it("should create snapshots from data rows", async () => {
    const result = await importYouzhiyouhang(db, FIXTURE_PATH);
    expect(result.snapshotsCreated).toBe(4); // 4 data rows in sample

    const snaps = listSnapshots(db);
    expect(snaps).toHaveLength(4);
  });

  it("should update account balance to latest snapshot value", async () => {
    const result = await importYouzhiyouhang(db, FIXTURE_PATH);
    const acc = getAccount(db, result.accountId);
    expect(acc).not.toBeNull();
    expect(acc!.balance).toBe(290000); // last row's total asset
  });

  it("should be idempotent — skip existing snapshots on re-import", async () => {
    const result1 = await importYouzhiyouhang(db, FIXTURE_PATH);
    expect(result1.snapshotsCreated).toBe(4);

    const result2 = await importYouzhiyouhang(db, FIXTURE_PATH);
    expect(result2.snapshotsCreated).toBe(0);
    expect(result2.snapshotsSkipped).toBe(4);

    // Still only 4 snapshots total
    const snaps = listSnapshots(db);
    expect(snaps).toHaveLength(4);
  });
});
