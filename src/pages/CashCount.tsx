import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, queueCashCount, transactionsForLocalDate } from "../lib/db";
import { getDeviceId } from "../lib/device";
import { sync } from "../lib/sync";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const iconProps = {
  viewBox: "0 0 24 24",
  className: "h-5 w-5 shrink-0 text-gold-300",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true
};

const CoinsIcon = () => (
  <svg {...iconProps}>
    <ellipse cx="12" cy="7" rx="7" ry="3" />
    <path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7" />
    <path d="M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
  </svg>
);

const PersonIcon = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c1.2-3.5 4-5 7-5s5.8 1.5 7 5" />
  </svg>
);

const NoteIcon = () => (
  <svg {...iconProps}>
    <rect x="5" y="4" width="14" height="16" rx="2" />
    <path d="M8.5 9h7M8.5 12.5h7M8.5 16h4" />
  </svg>
);

const SaveIcon = () => (
  <svg {...iconProps} className="h-5 w-5 shrink-0">
    <path d="M5 5h11l3 3v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" />
    <path d="M9 5v5h6V5" />
    <rect x="8" y="13" width="8" height="6" rx="1" />
  </svg>
);

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
        <p className="text-5xl text-gold-300">✓</p>
        <p className="text-2xl font-semibold">Cash count recorded for {shiftDate}</p>
        {count && (
          <p className="text-cream/55">
            GHS {count.actual.toFixed(2)} counted by {count.counted_by}
          </p>
        )}
        <p className="max-w-md text-sm text-cream/40">
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
        <p className="text-sm text-cream/55">
          {shiftDate} · count it with someone else present if you can
        </p>
      </div>

      <div className="panel flex items-center gap-3 p-4 text-sm text-cream/60">
        <CoinsIcon />
        <span>Count everything in the drawer, including the float, and type the total.</span>
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-sm text-cream/55">Counted by</span>
        <span className="field">
          <PersonIcon />
          <input
            className="text-lg"
            value={countedBy}
            onChange={(e) => setCountedBy(e.target.value)}
            placeholder="Your name, and anyone with you"
          />
        </span>
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm text-cream/55">Actual counted (GHS)</span>
        <span className="field">
          <span className="shrink-0 rounded-full border border-gold-600/40 px-2 py-0.5 text-xs text-gold-300">
            GHS
          </span>
          <input
            className="text-2xl"
            inputMode="decimal"
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            placeholder="0.00"
          />
        </span>
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm text-cream/55">Notes (optional)</span>
        <span className="field items-start py-3">
          <NoteIcon />
          <textarea
            className="text-base"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything that explains a difference — a refund, a float top-up…"
          />
        </span>
      </label>

      <button
        type="button"
        className="btn-primary"
        disabled={!Number.isFinite(actualNumber) || countedBy.trim().length === 0}
        onClick={submit}
      >
        <SaveIcon />
        Save count
      </button>
    </div>
  );
}
