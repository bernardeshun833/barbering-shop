import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import Backdrop from "./components/Backdrop";
import Brand from "./components/Brand";
import LockScreen from "./components/LockScreen";
import SyncStatusBar from "./components/SyncStatusBar";
import { useSyncStatus } from "./hooks/useSyncStatus";
import CashCount from "./pages/CashCount";
import TodayLog from "./pages/TodayLog";
import TransactionEntry from "./pages/TransactionEntry";
import { db } from "./lib/db";
import { sync } from "./lib/sync";
import { DEMO_MODE, supabase } from "./lib/supabase";
import { DEMO_PINS, resetDemo, seedDemoData } from "./lib/demo";

const TABS = [
  { to: "/", label: "New sale" },
  { to: "/today", label: "Today" },
  { to: "/cash-count", label: "Cash count" }
];

/**
 * Unmissable on purpose. Someone handed this link will otherwise assume they
 * are looking at the real till — and a POS whose takings quietly live only in
 * one browser, on one phone, is the exact failure this whole system exists to
 * prevent. Better to labour the point than to be mistaken for production.
 */
function DemoBanner() {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
      <div className="flex items-center justify-between gap-3">
        <span>
          <strong className="text-amber-100">Demo.</strong> No shop database
          connected — everything stays in this browser.
        </span>
        <button
          type="button"
          className="shrink-0 rounded-lg border border-amber-400/40 px-3 py-1 font-medium"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide" : "PINs"}
        </button>
      </div>

      {open && (
        <div className="mt-2 border-t border-amber-400/20 pt-2">
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {Object.entries(DEMO_PINS).map(([name, pin]) => (
              <li key={name}>
                {name}: <strong className="text-amber-100">{pin}</strong>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-2 rounded-lg border border-amber-400/40 px-3 py-1 font-medium"
            onClick={() => {
              void resetDemo().then(() => window.location.reload());
            }}
          >
            Clear demo sales
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const status = useSyncStatus();
  const [ready, setReady] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);

  // No default value on purpose: `undefined` means IndexedDB has not
  // answered yet, and an empty array means it has and the shop has no
  // barbers. Treating the first as the second flashes the till on screen
  // for a moment before the lock screen replaces it, which reads as the
  // app letting you in and then changing its mind.
  const barbers = useLiveQuery(() => db.barbers.toArray(), []);
  const soleBarber = barbers?.length === 1 ? barbers[0] : null;

  useEffect(() => {
    void (async () => {
      if (DEMO_MODE) {
        await seedDemoData();
        setReady(true);
        return;
      }

      // Sign-in is best effort. A tablet that cannot reach Supabase must still
      // reach the sale screen — that is the entire point of offline-first, and
      // a failed auth call is exactly what happens when the network is down.
      // What it must not do is fail quietly: every RLS policy grants to the
      // signed-in device, so a tablet that is signed out reads an empty
      // barber list rather than an error, and looks like a shop with no staff.
      let reason: string | null = null;
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          const email = import.meta.env.VITE_DEVICE_EMAIL;
          const password = import.meta.env.VITE_DEVICE_PASSWORD;
          if (!email || !password) {
            reason =
              "This build has no device account in it. Set VITE_DEVICE_EMAIL and VITE_DEVICE_PASSWORD where the app is built, and deploy again.";
          } else {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) {
              reason = `Could not sign in as the shop device: ${error.message}`;
            }
          }
        }
      } catch (error) {
        reason = `Could not reach the shop database: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }

      if ((await db.barbers.count()) === 0) {
        if (!navigator.onLine) {
          reason =
            "This tablet has no barber list saved yet. Connect to the internet once to finish setup.";
        } else if (!reason) {
          // Signed in and online, so ask for the lists now rather than waiting
          // out the sync interval in front of someone who is trying to work.
          const result = await sync();
          if (result.error) {
            reason = `Could not load the shop lists: ${result.error}`;
          } else if ((await db.barbers.count()) === 0) {
            reason =
              "Signed in, but the shop database returned no barbers. Check that the barbers table has an active row, and that this app points at the right Supabase project.";
          }
        }
      }

      setSetupError(reason);
      setReady(true);
    })();
  }, []);

  if (!ready || !barbers) {
    return (
      <div className="flex h-full items-center justify-center text-cream/55">Loading…</div>
    );
  }

  // One barber on the books means the PIN is a start-of-shift unlock rather
  // than a per-sale step. Locked again on every reload, and by the Lock button.
  if (soleBarber && !unlocked) {
    return (
      <div className="flex h-full flex-col">
        {DEMO_MODE && <DemoBanner />}
        <LockScreen barber={soleBarber} onUnlock={() => setUnlocked(true)} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {DEMO_MODE && <DemoBanner />}
      <SyncStatusBar status={status} />

      <header className="relative flex items-center justify-between overflow-hidden px-4 pb-2 pt-3">
        <Backdrop src="header.jpg" scrim="from-ink-900/70 via-ink-900/80 to-ink-900" />
        <div className="relative">
          <Brand />
        </div>
      </header>

      <nav className="flex items-stretch gap-1 border-b border-gold-600/20 px-2">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === "/"}
            className={({ isActive }) =>
              `flex min-h-touch flex-1 items-center justify-center px-3 py-3 text-center text-sm font-medium leading-tight ${
                isActive
                  ? "border-b-2 border-gold-400 text-gold-200"
                  : "text-cream/45"
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}

        {soleBarber && (
          <button
            type="button"
            className="min-h-touch px-3 text-sm font-medium text-cream/45"
            onClick={() => setUnlocked(false)}
          >
            Lock
          </button>
        )}
      </nav>

      {setupError && (
        <p className="bg-amber-900/60 px-4 py-3 text-amber-100">{setupError}</p>
      )}

      <main className="flex flex-1 flex-col overflow-y-auto">
        <Routes>
          <Route path="/" element={<TransactionEntry />} />
          <Route path="/today" element={<TodayLog />} />
          <Route path="/cash-count" element={<CashCount />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
