import { useState } from "react";
import Brand from "./Brand";
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
    <div className="relative flex flex-1 flex-col overflow-y-auto">
      {/* Warm pool of light behind the lockup, so the top of the screen has
          depth without needing a photograph that has to be licensed and
          downloaded. Drop one in as public/backdrop.jpg and set it here if
          the shop has its own. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-72
                   bg-[radial-gradient(120%_90%_at_50%_0%,rgba(200,155,82,0.22),transparent_70%)]"
      />

      <div className="relative mx-auto flex w-full max-w-sm flex-1 flex-col gap-6 px-4 py-8">
        <Brand stacked />

        <div className="text-center">
          <h1 className="text-3xl font-semibold">Hello {barber.name}</h1>
          <p className="mt-1 text-cream/55">Enter your PIN to start</p>
        </div>

        <div className="flex justify-center gap-3">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`h-3 w-3 rounded-full transition-colors ${
                i < pin.length ? "bg-gold-300" : "border border-gold-600/40 bg-transparent"
              }`}
            />
          ))}
        </div>

        {error && <p className="text-center text-gold-200">{error}</p>}

        <NumPad value={pin} onChange={setPin} />

        <button
          type="button"
          className="btn-primary"
          disabled={pin.length !== 4 || checking}
          onClick={submit}
        >
          {checking ? "Checking…" : "Open"}
          {!checking && <span aria-hidden="true">→</span>}
        </button>
      </div>
    </div>
  );
}
