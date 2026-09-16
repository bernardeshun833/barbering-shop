import Dexie, { type Table } from "dexie";
import type {
  Barber,
  QueuedCashCount,
  QueuedTransaction,
  Service,
  ShopSettings
} from "../types";

interface SyncMetaRow {
  key: string;
  value: string;
}

class PosDatabase extends Dexie {
  transactions!: Table<QueuedTransaction, string>;
  cashCounts!: Table<QueuedCashCount, string>;
  barbers!: Table<Barber, string>;
  services!: Table<Service, string>;
  settings!: Table<ShopSettings & { id: string }, string>;
  meta!: Table<SyncMetaRow, string>;

  constructor() {
    super("kumasi-barbershop-pos");
    this.version(1).stores({
      transactions: "id, sync_state, created_at_local, barber_id",
      cashCounts: "id, sync_state, shift_date",
      barbers: "id, active",
      services: "id, active",
      settings: "id",
      meta: "key"
    });
  }
}

export const db = new PosDatabase();

export async function getMeta(key: string): Promise<string | undefined> {
  return (await db.meta.get(key))?.value;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value });
}

export async function queueTransaction(
  txn: Omit<QueuedTransaction, "sync_state" | "sync_attempts">
): Promise<void> {
  await db.transactions.add({ ...txn, sync_state: "pending", sync_attempts: 0 });
}

export async function queueCashCount(
  count: Omit<QueuedCashCount, "sync_state" | "sync_attempts">
): Promise<void> {
  await db.cashCounts.add({ ...count, sync_state: "pending", sync_attempts: 0 });
}

export async function pendingTransactions(): Promise<QueuedTransaction[]> {
  return db.transactions.where("sync_state").equals("pending").toArray();
}

export async function pendingCashCounts(): Promise<QueuedCashCount[]> {
  return db.cashCounts.where("sync_state").equals("pending").toArray();
}

export async function pendingCount(): Promise<number> {
  const [txns, counts] = await Promise.all([
    db.transactions.where("sync_state").equals("pending").count(),
    db.cashCounts.where("sync_state").equals("pending").count()
  ]);
  return txns + counts;
}

/** Everything this device logged on a given local date, synced or not. */
export async function transactionsForLocalDate(
  isoDate: string
): Promise<QueuedTransaction[]> {
  const all = await db.transactions.toArray();
  return all.filter((t) => t.created_at_local.slice(0, 10) === isoDate);
}

/**
 * Drop synced rows older than two days from this device.
 *
 * The Today screen needs today, and a void needs the row it corrects, so two
 * days is the whole working set. Everything beyond it is already on the server
 * and only reachable there through the owner's PIN (migration 0009) — leaving
 * a full copy in IndexedDB would make that lock decorative, because devtools
 * is one tap away on any browser.
 *
 * Only synced rows go. A row that has not reached the server is the one thing
 * this device holds that nothing else does, and it stays until it has.
 */
export async function pruneSyncedHistory(days = 2): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const stale = await db.transactions
    .where("sync_state")
    .equals("synced")
    .filter((t) => t.created_at_local < cutoff)
    .primaryKeys();

  if (stale.length > 0) await db.transactions.bulkDelete(stale);
  return stale.length;
}
