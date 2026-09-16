import { useEffect, useState } from "react";
import NumPad from "../components/NumPad";
import {
  daySales,
  dailyTotals,
  monthRange,
  unlockHistory,
  type DaySale,
  type DayTotal
} from "../lib/owner";
import { DEMO_MODE } from "../lib/supabase";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function weekday(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric"
  });
}

/**
 * The owner's record: what every day came to, and what any day was made of.
 *
 * Behind its own PIN, not the shift PIN. The person on the tablet running the
 * till and the person in the UK checking the till are different people with
 * different interests — someone deciding whether to under-ring tonight should
 * not be able to study which nights the nightly job flagged and which slipped
 * by. Migration 0009 is what actually enforces that; this screen is only the
 * door.
 */
export default function History({
  pin,
  onUnlock
}: {
  pin: string | null;
  onUnlock: (pin: string) => void;
}) {
  if (DEMO_MODE) {
    return (
      <Centered>
        <h1 className="text-xl font-semibold">History needs the shop database</h1>
        <p className="mt-2 text-cream/55">
          There is nothing behind the demo to have a history of — sales here
          live in this browser only.
        </p>
      </Centered>
    );
  }

  return pin ? <Record pin={pin} /> : <OwnerLock onUnlock={onUnlock} />;
}

function OwnerLock({ onUnlock }: { onUnlock: (pin: string) => void }) {
  const [entry, setEntry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // Same as the shift unlock: the fourth digit is the whole instruction, so
  // there is nothing left to confirm and no button to press.
  const onDigits = (next: string) => {
    if (checking) return;
    setError(null);
    setEntry(next);
    if (next.length !== 4) return;

    void (async () => {
      setChecking(true);
      try {
        await unlockHistory(next);
        onUnlock(next);
      } catch (e) {
        setEntry("");
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setChecking(false);
      }
    })();
  };

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-6 px-4 py-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Owner PIN</h1>
        <p className="mt-1 text-cream/55">
          The record is not part of the shift. This is checked by the shop
          database, so it needs a connection.
        </p>
      </div>

      <div className="flex justify-center gap-3">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-3 w-3 rounded-full transition-colors ${
              i < entry.length ? "bg-gold-300" : "border border-gold-600/40 bg-transparent"
            }`}
          />
        ))}
      </div>

      <p className="min-h-[3rem] text-center text-gold-200" role="status" aria-live="polite">
        {checking ? "Checking…" : error}
      </p>

      <NumPad value={entry} onChange={onDigits} />
    </div>
  );
}

function Record({ pin }: { pin: string }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [days, setDays] = useState<DayTotal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDays(null);
    setError(null);

    const { from, to } = monthRange(year, month);
    dailyTotals(pin, from, to)
      .then((rows) => !cancelled && setDays(rows))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));

    return () => {
      cancelled = true;
    };
  }, [pin, year, month]);

  const step = (by: number) => {
    const next = new Date(Date.UTC(year, month + by, 1));
    setYear(next.getUTCFullYear());
    setMonth(next.getUTCMonth());
    setOpen(null);
  };

  const takings = (days ?? []).reduce((sum, d) => sum + d.revenue, 0);
  const sales = (days ?? []).reduce((sum, d) => sum + d.sales, 0);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <button type="button" className="btn-secondary px-4" onClick={() => step(-1)}>
          ‹
        </button>
        <h1 className="text-lg font-semibold">
          {MONTHS[month]} {year}
        </h1>
        <button type="button" className="btn-secondary px-4" onClick={() => step(1)}>
          ›
        </button>
      </div>

      {days && days.length > 0 && (
        <p className="panel p-4 text-center">
          <span className="text-2xl text-gold-200">GHS {takings.toFixed(2)}</span>
          <span className="mt-1 block text-sm text-cream/55">
            {sales} {sales === 1 ? "sale" : "sales"} over {days.length}{" "}
            {days.length === 1 ? "day" : "days"}
          </span>
        </p>
      )}

      {error && <p className="panel p-4 text-center text-gold-200">{error}</p>}
      {!days && !error && <p className="p-4 text-center text-cream/55">Loading…</p>}

      {days && days.length === 0 && (
        <p className="panel p-6 text-center text-cream/55">
          No sales logged in this month.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {(days ?? []).map((d) => (
          <li key={d.day} className="panel overflow-hidden">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 p-3 text-left"
              onClick={() => setOpen(open === d.day ? null : d.day)}
            >
              <span className="min-w-0">
                <span className="font-medium">{weekday(d.day)}</span>
                <span className="mt-0.5 block text-sm text-cream/55">
                  {d.sales} {d.sales === 1 ? "sale" : "sales"}
                  {d.voids > 0 && ` · ${d.voids} voided`}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {/* The nightly job's verdict, shown only when it found
                    something. A green tick on every clean day would teach the
                    eye to skip the row, which is where the flagged ones live. */}
                {d.severity && d.severity !== "NONE" && (
                  <span className="rounded bg-amber-900/60 px-2 py-0.5 text-xs text-amber-200">
                    {d.severity}
                  </span>
                )}
                <span className="whitespace-nowrap text-lg">
                  GHS {d.revenue.toFixed(2)}
                </span>
              </span>
            </button>

            {open === d.day && <DayDetail pin={pin} day={d.day} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DayDetail({ pin, day }: { pin: string; day: string }) {
  const [rows, setRows] = useState<DaySale[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    daySales(pin, day)
      .then((r) => !cancelled && setRows(r))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [pin, day]);

  if (error) return <p className="border-t border-gold-600/20 p-3 text-gold-200">{error}</p>;
  if (!rows) return <p className="border-t border-gold-600/20 p-3 text-cream/55">Loading…</p>;

  return (
    <ul className="border-t border-gold-600/20">
      {rows.map((r, i) => (
        <li
          key={`${r.at}-${i}`}
          className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
        >
          <span className="min-w-0 truncate">
            {new Date(r.at).toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit"
            })}{" "}
            · {r.service} · {r.method}
            {r.is_correction && (
              <span className="ml-2 rounded bg-amber-900/60 px-2 py-0.5 text-xs text-amber-200">
                void
              </span>
            )}
          </span>
          <span className="shrink-0">GHS {r.amount.toFixed(2)}</span>
        </li>
      ))}
    </ul>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center p-6 text-center">
      {children}
    </div>
  );
}
