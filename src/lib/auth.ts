import { supabase } from "./supabase";

/**
 * The tablet's Supabase session.
 *
 * Every read policy in migration 0004 grants to `authenticated` — the one
 * account that represents this device. Without a session the tablet is
 * anonymous, and Postgres answers with zero rows rather than an error, which
 * on screen is indistinguishable from a shop with no staff.
 *
 * The session is established ONCE, by hand, on the device itself (see
 * DeviceSetup). It is not compiled into the build: a `VITE_` variable is
 * public by definition, and a password in the bundle hands an authenticated
 * session to anyone who opens the site and reads the page source — which is
 * enough to list the barbers' PIN hashes and to insert sales that never
 * happened, into a table designed so nothing can ever be deleted.
 *
 * Supabase keeps the refresh token in this origin's local storage and renews
 * it in the background, so provisioning survives restarts and long offline
 * stretches. Clearing the browser's site data means provisioning again, which
 * is the cost of not shipping the password.
 */

/** Credentials still baked into the build, if this deploy predates the fix. */
export function legacyBuildCredentials(): { email: string; password: string } | null {
  const email = import.meta.env.VITE_DEVICE_EMAIL;
  const password = import.meta.env.VITE_DEVICE_PASSWORD;
  return email && password ? { email, password } : null;
}

export async function hasSession(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    return Boolean(data.session);
  } catch {
    // An unreachable auth endpoint is not a missing session. The stored token
    // is still there, and the caller decides whether that is fatal.
    return false;
  }
}

export interface SignInResult {
  ok: boolean;
  error?: string;
}

export async function signInDevice(email: string, password: string): Promise<SignInResult> {
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function signOutDevice(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch {
    // Nothing useful to do: the point is to drop the local token, and
    // signOut has already cleared it before any network call fails.
  }
}
