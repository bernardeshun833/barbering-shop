import { useState } from "react";
import Backdrop from "./Backdrop";
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

  /**
   * The fourth digit is the whole instruction — there is nothing left to
   * confirm, so there is no button to press. Verification is fired from the
   * keypad handler rather than an effect so it runs exactly once per attempt.
   */
  const onDigits = (next: string) => {
    if (checking) return;

    setError(null);
    setPin(next);
    if (next.length !== 4) return;

    void (async () => {
      setChecking(true);
      const ok = await verifyPin(next, barber);
      setChecking(false);

      if (ok) {
        onUnlock();
        return;
      }

      // Cleared, so the next attempt starts from an empty row of dots rather
      // than leaving her to work out which digit to delete.
      setPin("");
      setError("That PIN is not right — try again");
    })();
  };

  return (
    <div className="relative flex flex-1 flex-col overflow-y-auto">
      {/* The shop's own photograph when public/backdrop.jpg exists; a warm
          pool of light when it does not, so the screen never looks unfinished
          while the image is still being produced. */}
      <Backdrop src="backdrop.jpg" className="h-[26rem]" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-72
                   bg-[radial-gradient(120%_90%_at_50%_0%,rgba(200,155,82,0.18),transparent_70%)]"
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

        {/* Fixed height: the message appearing and clearing must not shift the
            keypad under her thumb mid-attempt. */}
        <p
          className="min-h-[1.5rem] text-center text-gold-200"
          role="status"
          aria-live="polite"
        >
          {checking ? "Checking…" : error}
        </p>

        <NumPad value={pin} onChange={onDigits} />
      </div>
    </div>
  );
}
