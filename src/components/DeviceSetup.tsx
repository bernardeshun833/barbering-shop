import { useState } from "react";
import Backdrop from "./Backdrop";
import Brand from "./Brand";
import { signInDevice } from "../lib/auth";

/**
 * Provisions this tablet, once, with the shop's device account.
 *
 * This is the owner's job, done on the device, and it is why the password no
 * longer travels in the build. It is deliberately not the sort of screen the
 * manager is ever expected to see: after this, Supabase keeps the session
 * alive on its own and the app opens straight onto the shift PIN.
 */
export default function DeviceSetup({
  onDone,
  canSkip
}: {
  onDone: () => void;
  canSkip: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) return;
    setBusy(true);
    setError(null);

    const result = await signInDevice(email, password);
    setBusy(false);

    if (!result.ok) {
      setPassword("");
      setError(result.error ?? "Could not sign in");
      return;
    }
    onDone();
  };

  return (
    <div className="relative flex flex-1 flex-col overflow-y-auto">
      <Backdrop src="backdrop.jpg" className="h-[22rem]" />

      <div className="relative mx-auto flex w-full max-w-sm flex-1 flex-col gap-5 px-4 py-8">
        <Brand stacked />

        <div className="text-center">
          <h1 className="text-2xl font-semibold">Set up this tablet</h1>
          <p className="mt-2 text-sm text-cream/55">
            Once only, by the owner. The tablet stays signed in afterwards and
            opens straight onto the PIN.
          </p>
        </div>

        <label className="flex flex-col gap-2">
          <span className="text-sm text-cream/55">Device account email</span>
          <span className="field">
            <input
              className="text-base"
              type="email"
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="device@ohemaaeffe.co.uk"
            />
          </span>
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm text-cream/55">Password</span>
          <span className="field">
            <input
              className="text-base"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
            />
          </span>
        </label>

        <p className="min-h-[1.5rem] text-center text-gold-200" role="status" aria-live="polite">
          {busy ? "Signing in…" : error}
        </p>

        <button
          type="button"
          className="btn-primary"
          disabled={busy || !email.trim() || !password}
          onClick={() => void submit()}
        >
          Sign this tablet in
        </button>

        {canSkip && (
          // Only offered when the shop's lists are already on the device: a
          // sale entered now is still durable and still queued, and refusing
          // to open the till because the session lapsed would lose takings to
          // protect a screen.
          <button type="button" className="btn-secondary" onClick={onDone}>
            Carry on without it for now
          </button>
        )}

        <p className="text-center text-xs text-cream/40">
          This account is the shop's, not a barber's. Create it in Supabase
          under Authentication → Users.
        </p>
      </div>
    </div>
  );
}
