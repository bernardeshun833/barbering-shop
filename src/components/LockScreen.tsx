import { useState } from "react";
import NumPad from "./NumPad";
import { verifyPin } from "../lib/pin";
import type { Barber } from "../types";

/**
 * Shown when the shop has a single barber, who is also the person working the
 * tablet. Asking for the same PIN before every sale would be pure friction:
 * with one possible barber there is nothing to attribute. The PIN is asked
 * once, at the start of the shift.
 *
 * With a second barber on the books the app goes back to a PIN per sale
 * (see TransactionEntry) — that is the point at which "who did this cut?"
 * becomes a question worth answering on every row.
 */
export default function LockScreen({
  barber,
  onUnlock
}: {
  barber: Barber;
  onUnlock: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const submit = async () => {
    setChecking(true);
    const ok = await verifyPin(pin, barber);
    setChecking(false);

    if (!ok) {
      setPin("");
      setError("Wrong PIN");
      return;
    }
    onUnlock();
  };

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="flex w-full max-w-sm flex-col gap-5">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Hello {barber.name}</h1>
          <p className="mt-1 text-gray-400">Enter your PIN to start</p>
        </div>

        <div className="flex justify-center gap-3">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`h-4 w-4 rounded-full ${
                i < pin.length ? "bg-emerald-400" : "bg-gray-700"
              }`}
            />
          ))}
        </div>

        {error && <p className="text-center text-amber-300">{error}</p>}

        <NumPad value={pin} onChange={setPin} />

        <button
          type="button"
          className="btn-primary"
          disabled={pin.length !== 4 || checking}
          onClick={submit}
        >
          {checking ? "Checking…" : "Open"}
        </button>
      </div>
    </div>
  );
}
