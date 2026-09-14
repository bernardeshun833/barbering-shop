import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, queueCashCount, transactionsForLocalDate } from "../lib/db";
import { getDeviceId } from "../lib/device";
import { sync } from "../lib/sync";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function CashCount() {
  const shiftDate = todayIso();

  const settings = useLiveQuery(() => db.settings.get("current"), []);
  const todaysTxns = useLiveQuery(() => transactionsForLocalDate(shiftDate), [shiftDate], []);
  const alreadyCounted = useLiveQuery(
    () => db.cashCounts.where("shift_date").equals(shiftDate).first(),
    [shiftDate]
  );

  const [countedBy, setCountedBy] = useState("");
  const [actual, setActual] = useState("");
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);

  const openingFloat = settings?.opening_float ?? 0;

  const cashTaken = useMemo(
    () =>
      todaysTxns
        .filter((t) => t.payment_method === "cash")
        .reduce((sum, t) => sum + t.amount, 0),
    [todaysTxns]
  );

  // Computed, recorded, and deliberately never shown. A count taken against a
  // number already on screen is not really a count: it tells whoever is
  // holding the cash exactly what total to produce. Blind counting is the
  // whole value of the exercise, and the reconciliation job recomputes this
  // server-side anyway, so nothing is lost by keeping it off the tablet.
  const expected = cashTaken + openingFloat;
  const actualNumber = Number.parseFloat(actual);

  const submit = async () => {
    if (!Number.isFinite(actualNumber) || countedBy.trim().length === 0) return;
    await queueCashCount({
      id: crypto.randomUUID(),
      shift_date: shiftDate,
      counted_by: countedBy.trim(),
      expected,
      actual: actualNumber,
      opening_float: openingFloat,
      notes: notes.trim() || null,
      device_id: getDeviceId(),
      created_at_local: new Date().toISOString()
    });
    setSaved(true);
    void sync();
  };

  if (saved || alreadyCounted) {
    const count = alreadyCounted;
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-5xl">✓</p>
        <p className="text-2xl font-semibold">Cash count recorded for {shiftDate}</p>
        {count && (
          <p className="text-gray-400">
            GHS {count.actual.toFixed(2)} counted by {count.counted_by}
          </p>
        )}
        <p className="max-w-md text-sm text-gray-500">
          Counts cannot be edited. If this one was wrong, record the correction in
          tonight's notes and tell the owner — the numbers are meant to be a record of
          what was counted, not what should have been counted.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 p-4">
      <div>
        <h1 className="text-xl font-semibold">End of shift cash count</h1>
        <p className="text-sm text-gray-400">
          {shiftDate} · count it with someone else present if you can
        </p>
      </div>

      <p className="rounded-xl bg-gray-800 p-4 text-sm text-gray-400">
        Count everything in the drawer, including the float, and type the total.
      </p>

      <label className="flex flex-col gap-2">
        <span className="text-sm text-gray-400">Counted by</span>
        <input
          className="min-h-touch rounded-xl border border-gray-700 bg-gray-800 px-4 text-lg"
          value={countedBy}
          onChange={(e) => setCountedBy(e.target.value)}
          placeholder="Your name, and anyone who counted with you"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm text-gray-400">Actual counted (GHS)</span>
        <input
          className="min-h-touch rounded-xl border border-gray-700 bg-gray-800 px-4 text-2xl"
          inputMode="decimal"
          value={actual}
          onChange={(e) => setActual(e.target.value)}
          placeholder="0.00"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm text-gray-400">Notes (optional)</span>
        <textarea
          className="rounded-xl border border-gray-700 bg-gray-800 p-4 text-base"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything that explains a difference — a refund, a float top-up…"
        />
      </label>

      <button
        type="button"
        className="btn-primary"
        disabled={!Number.isFinite(actualNumber) || countedBy.trim().length === 0}
        onClick={submit}
      >
        Record count
      </button>
    </div>
  );
}
