import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import SyncStatusBar from "./components/SyncStatusBar";
import { useSyncStatus } from "./hooks/useSyncStatus";
import CashCount from "./pages/CashCount";
import TodayLog from "./pages/TodayLog";
import TransactionEntry from "./pages/TransactionEntry";
import { db } from "./lib/db";
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
    <div className="bg-amber-500 px-4 py-2 text-sm text-amber-950">
      <div className="flex items-center justify-between gap-3">
        <span>
          <strong>Demo.</strong> No shop database connected — everything stays in
          this browser.
        </span>
        <button
          type="button"
          className="shrink-0 rounded-lg border border-amber-900/40 px-3 py-1 font-medium"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide" : "PINs"}
        </button>
      </div>

      {open && (
        <div className="mt-2 border-t border-amber-900/25 pt-2">
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {Object.entries(DEMO_PINS).map(([name, pin]) => (
              <li key={name}>
                {name}: <strong>{pin}</strong>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-2 rounded-lg border border-amber-900/40 px-3 py-1 font-medium"
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
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          const email = import.meta.env.VITE_DEVICE_EMAIL;
          const password = import.meta.env.VITE_DEVICE_PASSWORD;
          if (email && password) {
            await supabase.auth.signInWithPassword({ email, password });
          }
        }
      } catch {
        // Falls through to the cached barber list below.
      }

      const cachedBarbers = await db.barbers.count();
      if (cachedBarbers === 0 && !navigator.onLine) {
        setSetupError(
          "This tablet has no barber list saved yet. Connect to the internet once to finish setup."
        );
      }
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">Loading…</div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {DEMO_MODE && <DemoBanner />}
      <SyncStatusBar status={status} />

      <nav className="flex gap-1 border-b border-gray-800 px-2">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === "/"}
            className={({ isActive }) =>
              `min-h-touch flex-1 px-4 py-3 text-center text-base font-medium ${
                isActive
                  ? "border-b-2 border-emerald-400 text-emerald-300"
                  : "text-gray-400"
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
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
