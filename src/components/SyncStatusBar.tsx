import type { SyncStatus } from "../hooks/useSyncStatus";
import { DEMO_MODE } from "../lib/supabase";

function relativeTime(date: Date | null): string {
  if (!date) return "never";
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m ago`;
}

/**
 * Deliberately shows the queue depth rather than a generic "syncing" spinner:
 * the manager should be able to see at a glance how many sales exist only on
 * this tablet, because that is exactly what is lost if the device goes.
 */
export default function SyncStatusBar({ status }: { status: SyncStatus }) {
  // "synced 2m ago" would be a claim that a server holds the data. In demo
  // mode nothing does, and the status bar is the last place to be loose
  // about that.
  if (DEMO_MODE) {
    return (
      <div className="flex items-center justify-between bg-ink-700 px-4 py-2 text-sm text-cream/70">
        <span className="font-medium">
          {status.online ? "Demo mode" : "Offline — sales are being saved on this device"}
        </span>
        <span>
          {status.pending > 0 ? `${status.pending} waiting · ` : ""}saved in this browser
        </span>
      </div>
    );
  }

  const stale =
    !status.lastSyncedAt || Date.now() - status.lastSyncedAt.getTime() > 30 * 60 * 1000;

  const tone = !status.online
    ? "bg-amber-900/60 text-amber-100"
    : stale || status.pending > 0
      ? "bg-sky-900/60 text-sky-100"
      : "bg-ink-700 text-cream/70";

  return (
    <div className={`flex items-center justify-between px-4 py-2 text-sm ${tone}`}>
      <span className="font-medium">
        {status.online ? "Online" : "Offline — sales are being saved on this tablet"}
      </span>
      <span>
        {status.pending > 0 ? `${status.pending} waiting to sync · ` : ""}
        synced {relativeTime(status.lastSyncedAt)}
      </span>
    </div>
  );
}
