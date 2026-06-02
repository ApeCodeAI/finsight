import { ulid } from "ulid";
import { eq } from "drizzle-orm";
import {
  accounts,
  positions,
  transactions,
  snapshots,
  exchange_rates,
  reconciliations,
} from "../db/schema.js";
import type { AppDatabase } from "../db/connection.js";
import { listAccounts } from "../services/account.js";
import { listPositions } from "../services/position.js";
import { listTransactions } from "../services/transaction.js";
import { listSnapshots } from "../services/snapshot.js";
import { lt } from "drizzle-orm";
import { readLedger } from "./read.js";
import {
  dumpDecisionsToLedger,
  loadDecisionsFromLedger,
} from "./decisions-sync.js";
import {
  writeAccountsFile,
  writeAllTransactions,
  writeAllSnapshots,
  writeAllFxRates,
  writeAllReconciliations,
  cleanupLegacyArtifacts,
  ensureReadme,
} from "./write.js";
import {
  LEDGER_SCHEMA_VERSION,
  type LedgerAccount,
  type LedgerAccountsFile,
  type LedgerFxRate,
  type LedgerPosition,
  type LedgerReconciliation,
  type LedgerSnapshotFile,
  type LedgerTransaction,
} from "./types.js";

/* ─────────────────────────────────────────────────────────────────────────
   DB -> Ledger   (one-shot export, used for initial migration)
   ─────────────────────────────────────────────────────────────────────── */

export function dumpDbToLedger(db: AppDatabase, root: string): {
  accounts: number;
  positions: number;
  transactions: number;
  snapshots: number;
  fx_rates: number;
  reconciliations: number;
  decisions: number;
} {
  ensureReadme(root);

  // 1) accounts.yaml — include nested open positions
  const accs = listAccounts(db, { includeInactive: true });
  const allPositions = listPositions(db);
  const positionsByAcc = new Map<string, typeof allPositions>();
  for (const p of allPositions) {
    if (!positionsByAcc.has(p.account_id)) positionsByAcc.set(p.account_id, []);
    positionsByAcc.get(p.account_id)!.push(p);
  }
  const accountsFile: LedgerAccountsFile = {
    schema_version: LEDGER_SCHEMA_VERSION,
    accounts: accs.map<LedgerAccount>((a) => {
      const ps = (positionsByAcc.get(a.id) ?? []).map<LedgerPosition>((p) => ({
        symbol: p.symbol,
        name: p.name ?? undefined,
        quantity: p.quantity,
        avg_cost: p.avg_cost,
        current_price: p.current_price,
        currency: p.currency,
        tags: p.tags ? safeJsonArray(p.tags) : undefined,
        notes: p.notes ?? undefined,
        opened_at: p.opened_at ?? undefined,
        closed_at: p.closed_at ?? undefined,
      }));
      return {
        id: a.id,
        name: a.name,
        type: a.type,
        institution: a.institution ?? undefined,
        currency: a.currency,
        cash_balance: a.balance,
        tags: a.tags ? safeJsonArray(a.tags) : undefined,
        is_active: a.is_active !== 0,
        notes: a.notes ?? undefined,
        positions: ps,
      };
    }),
  };
  writeAccountsFile(root, accountsFile);

  // 2) fx-rates.jsonl — preserves (from, to, rate, date) history.
  const fxRows = db.select().from(exchange_rates).all();
  const today = new Date().toISOString().slice(0, 10);
  const fxJsonl: LedgerFxRate[] = fxRows.length > 0
    ? fxRows.map<LedgerFxRate>((r) => ({
        date: r.rate_date,
        from: r.from_currency,
        to: r.to_currency,
        rate: r.rate,
      }))
    : [
        // Seed fallback so an empty DB still has a non-blank vault.
        { date: today, from: "USD", to: "CNY", rate: 6.8765 },
        { date: today, from: "HKD", to: "CNY", rate: 0.8543 },
      ];
  // Sort by date asc (then from/to) for stable diffs.
  fxJsonl.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.from.localeCompare(b.from) ||
      a.to.localeCompare(b.to),
  );
  writeAllFxRates(root, fxJsonl);

  // 3) transactions.jsonl
  const txns = listTransactions(db);
  const txnLedger: LedgerTransaction[] = txns
    .sort((a, b) => a.traded_at.localeCompare(b.traded_at))
    .map((t) => ({
      id: t.id,
      ts: t.traded_at,
      type: t.type,
      account_id: t.account_id,
      symbol: undefined, // resolved at write site when needed
      qty: t.quantity ?? undefined,
      price: t.price ?? undefined,
      amount: t.amount,
      fee: t.fee,
      currency: t.currency,
      counterpart_account_id: t.counterpart_account_id ?? undefined,
      note: t.notes ?? undefined,
      braindump_id: t.braindump_id ?? undefined,
    }));
  writeAllTransactions(root, txnLedger);

  // 4) snapshots.jsonl — one line per snapshot, sorted by date for stable diffs.
  //    Historical snapshots (yzyx-historical:<account>) keep their `notes`
  //    field as the disambiguator when multiple rows share a date.
  const snaps = listSnapshots(db);
  const snapsJsonl: LedgerSnapshotFile[] = snaps
    .map<LedgerSnapshotFile>((s) => ({
      schema_version: LEDGER_SCHEMA_VERSION,
      date: s.snapshot_date,
      total_net_worth: s.total_net_worth,
      currency: "CNY",
      notes: s.notes ?? null,
      accounts: s.data ? JSON.parse(s.data) : [],
    }))
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.notes ?? "").localeCompare(b.notes ?? ""),
    );
  writeAllSnapshots(root, snapsJsonl);

  // 5) reconciliations.jsonl
  const reconRows = db.select().from(reconciliations).all();
  const reconJsonl: LedgerReconciliation[] = reconRows
    .map<LedgerReconciliation>((r) => ({
      id: r.id,
      account_id: r.account_id,
      reconciled_at: r.reconciled_at,
      currency: r.currency,
      computed_total: r.computed_total,
      broker_total: r.broker_total,
      delta: r.delta,
      notes: r.notes ?? null,
    }))
    .sort(
      (a, b) =>
        a.reconciled_at.localeCompare(b.reconciled_at) ||
        a.id.localeCompare(b.id),
    );
  writeAllReconciliations(root, reconJsonl);

  // 6) decisions/YYYY-MM/<ulid>.md (one file per row, db is truth)
  const { written: decisionsCount } = dumpDecisionsToLedger(db, root);

  // Final sweep: drop legacy artifacts (snapshots/ folder, fx-rates.yaml)
  // left over from the pre-JSONL layout.
  cleanupLegacyArtifacts(root);

  return {
    accounts: accountsFile.accounts.length,
    positions: allPositions.length,
    transactions: txnLedger.length,
    snapshots: snapsJsonl.length,
    fx_rates: fxJsonl.length,
    reconciliations: reconJsonl.length,
    decisions: decisionsCount,
  };
}

/* ─────────────────────────────────────────────────────────────────────────
   Ledger -> DB   (rebuild cache on startup or via `finsight ledger rebuild`)
   ─────────────────────────────────────────────────────────────────────── */

export function rebuildDbFromLedger(db: AppDatabase, root: string): {
  accounts: number;
  positions: number;
  transactions: number;
  snapshots: number;
  fx_rates: number;
  reconciliations: number;
  decisions: number;
} {
  const ledger = readLedger(root);

  // Wipe all tables first to ensure ledger is the SOLE truth.
  db.delete(positions).run();
  db.delete(transactions).run();
  db.delete(snapshots).run();
  db.delete(exchange_rates).run();
  db.delete(reconciliations).run();
  db.delete(accounts).run();

  const ts = new Date().toISOString();

  // accounts
  let posCount = 0;
  for (const a of ledger.accountsFile.accounts) {
    db.insert(accounts)
      .values({
        id: a.id,
        name: a.name,
        type: a.type,
        currency: a.currency,
        institution: a.institution ?? null,
        tags: a.tags ? JSON.stringify(a.tags) : null,
        balance: a.cash_balance,
        notes: a.notes ?? null,
        is_active: a.is_active !== false ? 1 : 0,
        created_at: ts,
        updated_at: ts,
      })
      .run();
    for (const p of a.positions ?? []) {
      db.insert(positions)
        .values({
          id: ulid(),
          account_id: a.id,
          symbol: p.symbol,
          name: p.name ?? null,
          quantity: p.quantity,
          avg_cost: p.avg_cost,
          current_price: p.current_price,
          currency: p.currency,
          tags: p.tags ? JSON.stringify(p.tags) : null,
          notes: p.notes ?? null,
          opened_at: p.opened_at ?? ts,
          closed_at: p.closed_at ?? null,
          created_at: ts,
          updated_at: ts,
        })
        .run();
      posCount++;
    }
  }

  // fx-rates
  for (const fx of ledger.fxRates) {
    db.insert(exchange_rates)
      .values({
        id: ulid(),
        from_currency: fx.from,
        to_currency: fx.to,
        rate: fx.rate,
        rate_date: fx.date,
        created_at: ts,
      })
      .run();
  }

  // transactions
  for (const t of ledger.transactions) {
    db.insert(transactions)
      .values({
        id: t.id ?? ulid(),
        account_id: t.account_id,
        position_id: null,
        type: t.type,
        amount: t.amount ?? 0,
        quantity: t.qty ?? null,
        price: t.price ?? null,
        fee: t.fee ?? 0,
        currency: t.currency ?? "CNY",
        counterpart_account_id: t.counterpart_account_id ?? null,
        braindump_id: t.braindump_id ?? null,
        notes: t.note ?? null,
        traded_at: t.ts,
        created_at: ts,
      })
      .run();
  }

  // snapshots
  for (const s of ledger.snapshots) {
    db.insert(snapshots)
      .values({
        id: ulid(),
        snapshot_date: s.date.length > 10 ? s.date.slice(0, 10) : s.date,
        total_net_worth: s.total_net_worth,
        data: JSON.stringify(s.accounts ?? []),
        notes: s.notes ?? null,
        created_at: ts,
      })
      .run();
  }

  // reconciliations
  for (const r of ledger.reconciliations) {
    db.insert(reconciliations)
      .values({
        id: r.id,
        account_id: r.account_id,
        reconciled_at: r.reconciled_at,
        currency: r.currency,
        computed_total: r.computed_total,
        broker_total: r.broker_total,
        delta: r.delta,
        notes: r.notes ?? null,
        created_at: ts,
      })
      .run();
  }

  // decisions
  const { loaded: decisionsLoaded } = loadDecisionsFromLedger(db, root);

  return {
    accounts: ledger.accountsFile.accounts.length,
    positions: posCount,
    transactions: ledger.transactions.length,
    snapshots: ledger.snapshots.length,
    fx_rates: ledger.fxRates.length,
    reconciliations: ledger.reconciliations.length,
    decisions: decisionsLoaded,
  };
}

/* ─────────────────────────────────────────────────────────────────────────
   Verify   (does the ledger reproduce the current DB?)
   ─────────────────────────────────────────────────────────────────────── */

export interface LedgerDiff {
  ledger_accounts: number;
  db_accounts: number;
  ledger_positions: number;
  db_positions: number;
  ledger_transactions: number;
  db_transactions: number;
  ledger_snapshots: number;
  db_snapshots: number;
  ledger_fx_rates: number;
  db_fx_rates: number;
  ledger_reconciliations: number;
  db_reconciliations: number;
  in_sync: boolean;
}

export function verifyLedgerVsDb(db: AppDatabase, root: string): LedgerDiff {
  const ledger = readLedger(root);
  const dbAccs = listAccounts(db, { includeInactive: true });
  const dbPos = listPositions(db);
  const dbTxns = listTransactions(db);
  const dbSnaps = listSnapshots(db);
  const dbFx = db.select().from(exchange_rates).all();
  const dbRecons = db.select().from(reconciliations).all();
  const ledgerPosCount = ledger.accountsFile.accounts.reduce(
    (s, a) => s + (a.positions?.length ?? 0),
    0,
  );
  return {
    ledger_accounts: ledger.accountsFile.accounts.length,
    db_accounts: dbAccs.length,
    ledger_positions: ledgerPosCount,
    db_positions: dbPos.length,
    ledger_transactions: ledger.transactions.length,
    db_transactions: dbTxns.length,
    ledger_snapshots: ledger.snapshots.length,
    db_snapshots: dbSnaps.length,
    ledger_fx_rates: ledger.fxRates.length,
    db_fx_rates: dbFx.length,
    ledger_reconciliations: ledger.reconciliations.length,
    db_reconciliations: dbRecons.length,
    in_sync:
      ledger.accountsFile.accounts.length === dbAccs.length &&
      ledgerPosCount === dbPos.length &&
      ledger.transactions.length === dbTxns.length &&
      ledger.snapshots.length === dbSnaps.length &&
      ledger.fxRates.length === dbFx.length &&
      ledger.reconciliations.length === dbRecons.length,
  };
}

function safeJsonArray(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   Purge   (one-time cleanup when historical data is unreliable)

   Deletes everything dated strictly BEFORE `cutoff` (YYYY-MM-DD):
   - transactions WHERE traded_at < cutoff
   - snapshots    WHERE snapshot_date < cutoff

   Leaves accounts / positions / decisions / targets / reconciliations
   untouched — those describe current state, not historical events.
   ─────────────────────────────────────────────────────────────────────── */

export function purgeHistoricalBefore(
  db: AppDatabase,
  cutoff: string,
): {
  cutoff: string;
  transactions_deleted: number;
  snapshots_deleted: number;
} {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) {
    throw new Error(`Invalid cutoff date: ${cutoff} (expected YYYY-MM-DD)`);
  }
  const txnsToDelete = db
    .select()
    .from(transactions)
    .where(lt(transactions.traded_at, cutoff))
    .all();
  const snapsToDelete = db
    .select()
    .from(snapshots)
    .where(lt(snapshots.snapshot_date, cutoff))
    .all();
  if (txnsToDelete.length > 0) {
    db.delete(transactions).where(lt(transactions.traded_at, cutoff)).run();
  }
  if (snapsToDelete.length > 0) {
    db.delete(snapshots).where(lt(snapshots.snapshot_date, cutoff)).run();
  }
  return {
    cutoff,
    transactions_deleted: txnsToDelete.length,
    snapshots_deleted: snapsToDelete.length,
  };
}
