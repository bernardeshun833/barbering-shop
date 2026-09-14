import { db } from "./db";
import type { Barber, Service } from "../types";

/** PINs are shown on screen in demo mode, so they are no secret here. */
export const DEMO_PINS: Record<string, string> = {
  Effe: "1212"
};

// Same hash as supabase/seed.sql, so the demo behaves exactly like a real
// device that has synced — including a wrong PIN being rejected.
const DEMO_BARBERS: Barber[] = [
  {
    id: "demo-barber-1",
    name: "Effe",
    pin_hash: "3f57b1510a156f3f0a4057cc5bfa37df41523018d9c59535b9deb419eccd157b",
    pin_salt: "4feeccfeb57b58b9",
    pin_iterations: 200000,
    commission_rate: 0.4,
    active: true
  }
];

const DEMO_SERVICES: Service[] = [
  { id: "demo-service-1", name: "Haircut", price: 40, active: true },
  { id: "demo-service-2", name: "Haircut + Beard", price: 60, active: true },
  { id: "demo-service-3", name: "Beard Trim", price: 25, active: true },
  { id: "demo-service-4", name: "Shave", price: 30, active: true },
  { id: "demo-service-5", name: "Kids Cut", price: 30, active: true },
  { id: "demo-service-6", name: "Line Up", price: 20, active: true }
];

/**
 * Populates the barber and service lists a real device would have received on
 * its first sync. Only fills gaps — any sales logged during the demo are left
 * exactly where they are, so the queue survives a reload the way it would on
 * the shop floor.
 */
export async function seedDemoData(): Promise<void> {
  if ((await db.barbers.count()) === 0) {
    await db.barbers.bulkPut(DEMO_BARBERS);
  }
  if ((await db.services.count()) === 0) {
    await db.services.bulkPut(DEMO_SERVICES);
  }
  if (!(await db.settings.get("current"))) {
    await db.settings.put({
      id: "current",
      opening_float: 200,
      open_time: "08:00",
      close_time: "20:00",
      timezone: "Africa/Accra",
      // Cash only, matching the shop's actual opening configuration.
      momo_enabled: false
    });
  }
}

/** Wipes the demo back to a clean shop — sales, cash counts and all. */
export async function resetDemo(): Promise<void> {
  await db.transaction("rw", db.transactions, db.cashCounts, db.meta, async () => {
    await db.transactions.clear();
    await db.cashCounts.clear();
    await db.meta.clear();
  });
}
