import { supabase } from "./supabase";

/**
 * The owner's view of the record. Everything here goes through database
 * functions that check the owner PIN themselves (migration 0009) — the PIN is
 * never verified on this device, and the history is not readable without it
 * even with devtools open and the anon key in hand.
 *
 * The PIN is passed on every call and held only in React state for as long as
 * the screen is open. It is never written to storage: a PIN cached on the
 * tablet is a PIN available to whoever is holding the tablet.
 */

export interface DayTotal {
  day: string;
  sales: number;
  voids: number;
  revenue: number;
  severity: string | null;
}

export interface DaySale {
  at: string;
  service: string;
  barber: string;
  amount: number;
  method: string;
  is_correction: boolean;
}

/** Postgres numerics arrive as strings through PostgREST often enough to matter. */
function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

/**
 * Turn the function's raised codes into something worth reading on a phone.
 * The codes are deliberately terse in SQL so this is the only place the
 * wording lives.
 */
export function readable(message: string): string {
  const locked = message.match(/LOCKED_UNTIL (\d{2}:\d{2})/);
  if (locked) return `Too many wrong PINs. Try again after ${locked[1]}.`;
  if (message.includes("WRONG_PIN")) return "That PIN is not right";
  if (message.includes("NO_OWNER_PIN")) {
    return "No owner PIN has been set yet — see docs/history.md";
  }
  return message;
}

/**
 * First and last day of a month, as the dates the database functions expect.
 * Built in UTC so the browser's own timezone cannot shift which month it is —
 * the owner is in the UK and the shop is in Ghana, and a local-time `new
 * Date(y, m, 1)` in British summer time lands on the last day of the previous
 * month.
 */
export function monthRange(year: number, month: number): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return {
    from: `${year}-${pad(month + 1)}-01`,
    to: `${year}-${pad(month + 1)}-${pad(lastDay)}`
  };
}

export async function unlockHistory(pin: string): Promise<true> {
  const { data, error } = await supabase.rpc("owner_pin_ok", { p_pin: pin });
  if (error) throw new Error(readable(error.message));
  if (data !== true) throw new Error("That PIN is not right");
  return true;
}

export async function dailyTotals(
  pin: string,
  from: string,
  to: string
): Promise<DayTotal[]> {
  const { data, error } = await supabase.rpc("owner_daily_totals", {
    p_pin: pin,
    p_from: from,
    p_to: to
  });
  if (error) throw new Error(readable(error.message));

  return (data ?? []).map((r: Record<string, unknown>) => ({
    day: String(r.day),
    sales: num(r.sales),
    voids: num(r.voids),
    revenue: num(r.revenue),
    severity: (r.severity as string | null) ?? null
  }));
}

export async function daySales(pin: string, day: string): Promise<DaySale[]> {
  const { data, error } = await supabase.rpc("owner_day_sales", {
    p_pin: pin,
    p_day: day
  });
  if (error) throw new Error(readable(error.message));

  return (data ?? []).map((r: Record<string, unknown>) => ({
    at: String(r.at),
    service: String(r.service),
    barber: String(r.barber),
    amount: num(r.amount),
    method: String(r.method),
    is_correction: Boolean(r.is_correction)
  }));
}
