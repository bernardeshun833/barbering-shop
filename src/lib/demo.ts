import { db } from "./db";
import type { Barber, Service } from "../types";

/** PINs are shown on screen in demo mode, so they are no secret here. */
export const DEMO_PINS: Record<string, string> = {
  "Kwame Mensah": "1234",
  "Ama Boateng": "2345",
  "Yaw Owusu": "3456"
};

// Same hashes as supabase/seed.sql, so the demo behaves exactly like a real
// device that has synced — including a wrong PIN being rejected.
const DEMO_BARBERS: Barber[] = [
  {
    id: "demo-barber-1",
    name: "Kwame Mensah",
    pin_hash: "55fb4e5859ddb05bfd8ccfdbab4a629d01909191cdb4ec285f6da3489df373b1",
    pin_salt: "a1b2c3d4e5f60718",
    pin_iterations: 200000,
    commission_rate: 0.4,
    active: true
  },
  {
    id: "demo-barber-2",
    name: "Ama Boateng",
    pin_hash: "205b07ae3e8007ad5d7bdbbbfa966acd37904083d4c49908a7828a672c174aa5",
    pin_salt: "b2c3d4e5f6071829",
    pin_iterations: 200000,
    commission_rate: 0.4,
    active: true
  },
  {
    id: "demo-barber-3",
    name: "Yaw Owusu",
    pin_hash: "93400b70080840be011838a4e1fe4acb9ee5418cf3fe6b9c2dcbb9570960a258",
    pin_salt: "c3d4e5f607182930",
    pin_iterations: 200000,
    commission_rate: 0.35,
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
