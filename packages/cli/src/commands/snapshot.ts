import { Command } from "commander";
import { takeSnapshot, listSnapshots, diffSnapshots, getSnapshot } from "@finsight/core";
import { initDb } from "../utils/config.js";
import {
  createTable,
  formatCurrency,
  colorPnL,
  colorPercent,
  printSuccess,
} from "../utils/display.js";
import { emitJson, fail, ExitCode } from "../utils/exit.js";

export const snapshotCmd = new Command("snapshot").description("Manage snapshots");

snapshotCmd
  .command("take")
  .description("Take a new snapshot of all accounts")
  .option("--note <note>", "Snapshot note")
  .option("--json", "Emit JSON")
  .action((opts) => {
    const db = initDb();
    const snap = takeSnapshot(db, opts.note);
    if (opts.json) {
      emitJson({
        ok: true,
        snapshot: {
          id: snap.id,
          snapshot_date: snap.snapshot_date,
          total_net_worth: snap.total_net_worth,
          notes: snap.notes,
        },
      });
      process.exit(ExitCode.OK);
    }
    printSuccess(`Snapshot taken: ${snap.snapshot_date}`);
    console.log(`  Net worth: ${formatCurrency(snap.total_net_worth)}`);
    console.log(`  ID: ${snap.id.slice(-8)}`);
  });

snapshotCmd
  .command("list")
  .description("List all snapshots")
  .option("--json", "Emit JSON")
  .action((opts) => {
    const db = initDb();
    const snaps = listSnapshots(db);

    if (opts.json) {
      emitJson({
        snapshots: snaps.map((s) => ({
          id: s.id,
          snapshot_date: s.snapshot_date,
          total_net_worth: s.total_net_worth,
          notes: s.notes,
          created_at: s.created_at,
        })),
      });
      process.exit(ExitCode.OK);
    }

    if (snaps.length === 0) {
      console.log("No snapshots found.");
      return;
    }

    const table = createTable(["ID", "Date", "Net Worth", "Notes"]);
    for (const s of snaps) {
      table.push([
        s.id.slice(-8),
        s.snapshot_date,
        formatCurrency(s.total_net_worth),
        (s.notes ?? "-").slice(0, 40),
      ]);
    }
    console.log(table.toString());
  });

snapshotCmd
  .command("show")
  .description("Show a snapshot's full data")
  .argument("<id>", "Snapshot ID (or partial)")
  .option("--json", "Emit JSON")
  .action((idInput, opts) => {
    const db = initDb();
    const snaps = listSnapshots(db);
    const s =
      snaps.find((x) => x.id === idInput) ??
      snaps.find((x) => x.id.endsWith(idInput));
    if (!s) {
      fail("NOT_FOUND", `Snapshot not found: ${idInput}`, { json: opts.json });
    }
    const full = getSnapshot(db, s.id);
    if (!full) {
      fail("NOT_FOUND", `Snapshot disappeared: ${s.id}`, { json: opts.json });
    }
    const data = full.data ? JSON.parse(full.data) : [];
    if (opts.json) {
      emitJson({ ...full, data });
      process.exit(ExitCode.OK);
    }
    console.log(`Snapshot ${s.id}`);
    console.log(`  Date: ${s.snapshot_date}`);
    console.log(`  Net worth: ${formatCurrency(s.total_net_worth)}`);
    console.log(`  Notes: ${s.notes ?? "-"}`);
    console.log(`  Accounts: ${data.length}`);
  });

snapshotCmd
  .command("diff")
  .description("Compare two snapshots")
  .argument("<id1>", "First snapshot ID (or partial)")
  .argument("<id2>", "Second snapshot ID (or partial)")
  .option("--json", "Emit JSON")
  .action((id1Input, id2Input, opts) => {
    const db = initDb();
    const snaps = listSnapshots(db);
    const findSnap = (inp: string) =>
      snaps.find((s) => s.id === inp) ?? snaps.find((s) => s.id.endsWith(inp));
    const s1 = findSnap(id1Input);
    const s2 = findSnap(id2Input);
    if (!s1) fail("NOT_FOUND", `Snapshot not found: ${id1Input}`, { json: opts.json });
    if (!s2) fail("NOT_FOUND", `Snapshot not found: ${id2Input}`, { json: opts.json });

    const diff = diffSnapshots(db, s1.id, s2.id);

    if (opts.json) {
      emitJson(diff);
      process.exit(ExitCode.OK);
    }

    console.log(`\n  Comparing: ${diff.date1} → ${diff.date2}`);
    console.log(
      `  Net worth change: ${colorPnL(
        diff.totalChange,
        formatCurrency(diff.totalChange),
      )} (${colorPercent(diff.totalChangePercent)})`,
    );

    if (diff.byAccount.length > 0) {
      const table = createTable(["Account", "Before", "After", "Change"]);
      for (const a of diff.byAccount) {
        table.push([
          a.account_name,
          formatCurrency(a.balance1),
          formatCurrency(a.balance2),
          colorPnL(a.change, formatCurrency(a.change)),
        ]);
      }
      console.log(table.toString());
    }
  });
