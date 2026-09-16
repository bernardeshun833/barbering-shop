import { db, getMeta, pendingCashCounts, pendingTransactions, setMeta } from "./db";
import { DEMO_MODE, supabase } from "./supabase";
import { getDeviceId } from "./device";
import type { Barber, Service, ShopSettings } from "../types";

/** Spec rule 4: "every few minutes when online, not once a day". */
export const SYNC_INTERVAL_MS = 2 * 60 * 1000;

const MAX_BACKOFF_MS = 5 * 60 * 1000;
const BASE_BACKOFF_MS = 2 * 1000;
const LAST_SYNC_KEY = "last_successful_sync";

export interface SyncResult {
  pushed: number;
  failed: number;
  refreshed: boolean;
  error?: string;
}

let inFlight: Promise<SyncResult> | null = null;
let consecutiveFailures = 0;

export async function getLastSyncedAt(): Promise<Date | null> {
  const raw = await getMeta(LAST_SYNC_KEY);
  return raw ? new Date(raw) : null;
}

/**
 * Push the local queue, then pull down the reference data the app needs to
 * keep working offline. Safe to call concurrently — overlapping calls share
 * the in-flight promise rather than double-sending rows.
 */
export async function sync(): Promise<SyncResult> {
  if (inFlight) return inFlight;
  inFlight = runSync().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runSync(): Promise<SyncResult> {
  if (!navigator.onLine) {
    return { pushed: 0, failed: 0, refreshed: false, error: "offline" };
  }

  // No backend configured: accept the queue locally so the entry flow behaves
  // as it will in production, without pretending a server received anything.
  // The demo banner is what tells the truth about where the data actually is.
  if (DEMO_MODE) {
    return acceptQueueLocally();
  }

  try {
    // Every policy in 0004 grants to `authenticated` — the one Supabase
    // account that represents this tablet. Signed out, the reads do not fail,
    // they come back empty, which looks exactly like a shop with no barbers.
    // Say which it is instead.
    const { data: auth } = await supabase.auth.getSession();
    if (!auth.session) {
      throw new Error(
        "not signed in as the shop device — check VITE_DEVICE_EMAIL and VITE_DEVICE_PASSWORD"
      );
    }

    const pushed = await pushQueue();
    const refreshed = await pullReferenceData();
    await reportHeartbeat();
    await setMeta(LAST_SYNC_KEY, new Date().toISOString());
    consecutiveFailures = 0;
    return { pushed: pushed.pushed, failed: pushed.failed, refreshed };
  } catch (error) {
    consecutiveFailures++;
    return {
      pushed: 0,
      failed: 0,
      refreshed: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Demo equivalent of a successful push: the queue drains so the status bar
 * and the Today screen behave as they will in the shop, but nothing leaves
 * the device and nothing is fabricated about a server having stored it.
 */
async function acceptQueueLocally(): Promise<SyncResult> {
  const [txns, counts] = await Promise.all([pendingTransactions(), pendingCashCounts()]);

  for (const txn of txns) {
    await db.transactions.update(txn.id, { sync_state: "synced" });
  }
  for (const count of counts) {
    await db.cashCounts.update(count.id, { sync_state: "synced" });
  }

  await setMeta(LAST_SYNC_KEY, new Date().toISOString());
  consecutiveFailures = 0;

  return { pushed: txns.length + counts.length, failed: 0, refreshed: false };
}

async function pushQueue(): Promise<{ pushed: number; failed: number }> {
  let pushed = 0;
  let failed = 0;

  const txns = await pendingTransactions();
  for (const txn of txns) {
    const { sync_state, sync_attempts, last_error, ...row } = txn;
    void sync_state;
    void last_error;

    // upsert, not insert: the row id is client-generated, so a retry after a
    // response we never saw lands on the same primary key instead of
    // creating a duplicate sale. ignoreDuplicates keeps the original row —
    // which matters, because transactions can never be updated.
    const { error } = await supabase
      .from("transactions")
      .upsert(row, { onConflict: "id", ignoreDuplicates: true });

    if (error) {
      failed++;
      await db.transactions.update(txn.id, {
        sync_attempts: sync_attempts + 1,
        last_error: error.message
      });
    } else {
      pushed++;
      await db.transactions.update(txn.id, { sync_state: "synced", last_error: undefined });
    }
  }

  const counts = await pendingCashCounts();
  for (const count of counts) {
    const { sync_state, sync_attempts, last_error, ...row } = count;
    void sync_state;
    void last_error;

    const { error } = await supabase
      .from("cash_counts")
      .upsert(row, { onConflict: "id", ignoreDuplicates: true });

    if (error) {
      failed++;
      await db.cashCounts.update(count.id, {
        sync_attempts: sync_attempts + 1,
        last_error: error.message
      });
    } else {
      pushed++;
      await db.cashCounts.update(count.id, { sync_state: "synced", last_error: undefined });
    }
  }

  return { pushed, failed };
}

/**
 * Shape a shop_settings row for the local copy.
 *
 * `shop_settings.id` is a boolean in Postgres — `true`, the check constraint
 * in migration 0003 that enforces exactly one row. IndexedDB keys cannot be
 * booleans, so the local copy is keyed on the string "current" instead, and
 * the row's own id must not be allowed to win: spread first, key last.
 *
 * Getting that order wrong is not a settings bug. The write shares a Dexie
 * transaction with the barber and service lists, so a rejected key rolls all
 * three back and the tablet comes up with nothing to sell.
 */
export function localSettingsRow(row: ShopSettings): ShopSettings & { id: string } {
  return { ...row, id: "current" };
}

async function pullReferenceData(): Promise<boolean> {
  const [barbers, services, settings] = await Promise.all([
    supabase.from("barbers").select("*").eq("active", true),
    supabase.from("services").select("*").eq("active", true),
    supabase.from("shop_settings").select("*").single()
  ]);

  // Thrown, not swallowed. A silent false here is how a tablet ends up sitting
  // on an empty barber list with nothing on screen to say why.
  const failure = barbers.error ?? services.error ?? settings.error;
  if (failure) throw new Error(failure.message);

  await db.transaction("rw", db.barbers, db.services, db.settings, async () => {
    await db.barbers.clear();
    await db.barbers.bulkPut(barbers.data as Barber[]);
    await db.services.clear();
    await db.services.bulkPut(services.data as Service[]);
    await db.settings.put(localSettingsRow(settings.data as ShopSettings));
  });

  return true;
}

async function reportHeartbeat(): Promise<void> {
  await supabase
    .from("device_heartbeats")
    .upsert(
      { device_id: getDeviceId(), last_synced_at: new Date().toISOString() },
      { onConflict: "device_id" }
    );
}

/**
 * Delay before the next attempt. Steady state is SYNC_INTERVAL_MS; after a
 * failure it backs off exponentially so a tablet with no signal is not
 * burning battery retrying every two minutes, capped so it still recovers
 * promptly once signal returns.
 */
export function nextSyncDelay(): number {
  if (consecutiveFailures === 0) return SYNC_INTERVAL_MS;
  return Math.min(BASE_BACKOFF_MS * 2 ** (consecutiveFailures - 1), MAX_BACKOFF_MS);
}

/**
 * Run the sync loop for the lifetime of the app. Syncs on an interval, and
 * immediately whenever the device regains connectivity or the app is brought
 * back to the foreground — the window of unsynced data is the thing this
 * whole system is trying to keep small.
 */
export function startSyncLoop(onResult?: (result: SyncResult) => void): () => void {
  let timer: number | undefined;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    const result = await sync();
    onResult?.(result);
    if (!stopped) {
      timer = window.setTimeout(tick, nextSyncDelay());
    }
  };

  const syncNow = () => {
    window.clearTimeout(timer);
    void tick();
  };

  const onVisible = () => {
    if (document.visibilityState === "visible") syncNow();
  };

  window.addEventListener("online", syncNow);
  document.addEventListener("visibilitychange", onVisible);
  void tick();

  return () => {
    stopped = true;
    window.clearTimeout(timer);
    window.removeEventListener("online", syncNow);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
