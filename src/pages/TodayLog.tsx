import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import NumPad from "../components/NumPad";
import { db, queueTransaction, transactionsForLocalDate } from "../lib/db";
import { getDeviceId } from "../lib/device";
import { verifyPin } from "../lib/pin";
import { sync } from "../lib/sync";
import type { Barber, QueuedTransaction } from "../types";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function TodayLog() {
  const shiftDate = todayIso();
  const txns = useLiveQuery(() => transactionsForLocalDate(shiftDate), [shiftDate], []);
  const barbers = useLiveQuery(() => db.barbers.toArray(), [], [] as Barber[]);
  const services = useLiveQuery(() => db.services.toArray(), [], []);

  const [voiding, setVoiding] = useState<QueuedTransaction | null>(null);

  const barberName = (id: string) => barbers.find((b) => b.id === id)?.name ?? "Unknown";
  const serviceName = (id: string) => services.find((s) => s.id === id)?.name ?? "Service";

  const voidedIds = new Set(
    txns.filter((t) => t.corrects_transaction_id).map((t) => t.corrects_transaction_id!)
  );

  const total = txns.reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Today · {shiftDate}</h1>
        <p className="text-lg">
          {txns.length} entries · GHS {total.toFixed(2)}
        </p>
      </div>

      {txns.length === 0 && (
        <p className="rounded-xl bg-ink-700 p-6 text-center text-cream/55">
          No sales logged yet today.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {[...txns]
          .sort((a, b) => b.created_at_local.localeCompare(a.created_at_local))
          .map((txn) => {
            const isCorrection = Boolean(txn.corrects_transaction_id);
            const wasVoided = voidedIds.has(txn.id);
            return (
              <li
                key={txn.id}
                className={`flex items-center justify-between rounded-xl border border-gold-600/25 bg-ink-700 p-3 ${
                  wasVoided ? "opacity-50" : ""
                }`}
              >
                <div>
                  <p className="font-medium">
                    {serviceName(txn.service_id)} · {barberName(txn.barber_id)}
                    {isCorrection && (
                      <span className="ml-2 rounded bg-amber-900/60 px-2 py-0.5 text-xs text-amber-200">
                        correction
                      </span>
                    )}
                    {wasVoided && (
                      <span className="ml-2 rounded bg-ink-600 px-2 py-0.5 text-xs">
                        voided
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-cream/55">
                    {new Date(txn.created_at_local).toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit"
                    })}{" "}
                    · {txn.payment_method} ·{" "}
                    {txn.sync_state === "synced" ? "synced" : "on this tablet only"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg">GHS {txn.amount.toFixed(2)}</span>
                  {!isCorrection && !wasVoided && (
                    <button
                      type="button"
                      className="btn-secondary min-h-0 px-3 py-2 text-sm"
                      onClick={() => setVoiding(txn)}
                    >
                      Void
                    </button>
                  )}
                </div>
              </li>
            );
          })}
      </ul>

      {voiding && (
        <VoidDialog
          txn={voiding}
          barber={barbers.find((b) => b.id === voiding.barber_id) ?? null}
          onClose={() => setVoiding(null)}
        />
      )}
    </div>
  );
}

/**
 * A void never removes the original row — it appends a negative correction
 * that points at it. Both stay in the log, which is the whole point: an
 * entry that was cancelled is visible as a cancellation rather than as an
 * absence.
 */
function VoidDialog({
  txn,
  barber,
  onClose
}: {
  txn: QueuedTransaction;
  barber: Barber | null;
  onClose: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const confirm = async () => {
    if (!barber) return;
    setChecking(true);
    const ok = await verifyPin(pin, barber);
    if (!ok) {
      setChecking(false);
      setPin("");
      setError("Incorrect PIN");
      return;
    }

    await queueTransaction({
      id: crypto.randomUUID(),
      barber_id: txn.barber_id,
      service_id: txn.service_id,
      amount: -txn.amount,
      payment_method: txn.payment_method,
      corrects_transaction_id: txn.id,
      created_at_local: new Date().toISOString(),
      device_id: getDeviceId()
    });

    setChecking(false);
    onClose();
    void sync();
  };

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/70 p-4">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-ink-800 p-5">
        <div>
          <h2 className="text-lg font-semibold">Void GHS {txn.amount.toFixed(2)}?</h2>
          <p className="mt-1 text-sm text-cream/55">
            This adds a correction entry. The original stays in the record.
          </p>
        </div>
        <p className="text-sm">
          {barber ? `${barber.name}, enter your PIN` : "Barber not found on this device"}
        </p>
        {error && <p className="text-gold-200">{error}</p>}
        <NumPad value={pin} onChange={setPin} />
        <div className="flex gap-3">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={pin.length !== 4 || checking || !barber}
            onClick={confirm}
          >
            {checking ? "Checking…" : "Void"}
          </button>
        </div>
      </div>
    </div>
  );
}
