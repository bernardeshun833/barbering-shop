import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * With no Supabase project configured, the app runs as a self-contained demo:
 * everything lives in IndexedDB on the device and nothing is sent anywhere.
 *
 * This exists so the tablet experience can be shown and tested — on a real
 * phone, over a real domain — before a backend exists. It is deliberately
 * loud about itself (see the banner in App.tsx): a POS that silently kept
 * takings only on the device would be worse than useless to this business.
 */
export const DEMO_MODE = !url || !anonKey;

// A placeholder URL keeps the client's type intact so call sites need no null
// checks. Nothing reaches it: the sync engine short-circuits in demo mode.
export const supabase = createClient(
  url ?? "https://demo.invalid",
  anonKey ?? "demo-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: !DEMO_MODE,
      // The tablet stays signed in as the shop device across restarts; the
      // manager should never be asked to type a Supabase password.
      storageKey: "barbershop.auth"
    }
  }
);
