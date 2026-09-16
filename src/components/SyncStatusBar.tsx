import type { SyncStatus } from "../hooks/useSyncStatus";
import { DEMO_MODE } from "../lib/supabase";

/**
 * Shown only when this tablet is holding sales the server has not got yet —
 * the one situation where the answer to "is it fine?" is no, and the manager
 * can do something about it (find signal, or don't wipe the tablet).
 *
 * A bar that is always on screen stops being read within a week, so the day
 * it matters it is not read either. "Offline" on its own is not that day:
 * offline with an empty queue means nothing is at risk, and announcing it
 * only teaches her to distrust a tablet that is working exactly as designed.
 */
export default function SyncStatusBar({ status }: { status: SyncStatus }) {
  if (status.pending === 0) return null;

  const where = DEMO_MODE
    ? "saved in this browser"
    : status.online
      ? "sending…"
      : "saved on this tablet";

  return (
    <div className="flex items-center justify-between gap-3 bg-ink-700 px-4 py-2 text-sm text-cream/70">
      <span className="font-medium text-gold-200">
        {status.pending} {status.pending === 1 ? "sale" : "sales"} waiting to send
      </span>
      <span>{where}</span>
    </div>
  );
}
