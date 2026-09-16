import { describe, expect, it } from "vitest";
import { localSettingsRow } from "../src/lib/sync";
import type { ShopSettings } from "../src/types";

const row: ShopSettings = {
  opening_float: 200,
  open_time: "09:00",
  close_time: "20:00",
  timezone: "Africa/Accra",
  momo_enabled: false
};

describe("localSettingsRow", () => {
  it("keys the local copy on the string 'current'", () => {
    expect(localSettingsRow(row).id).toBe("current");
  });

  it("does not let the Postgres boolean id through", () => {
    // What actually comes back from Supabase: shop_settings.id is
    // `boolean primary key default true check (id)` (migration 0003). An
    // IndexedDB key cannot be a boolean, and the put throws DataError —
    // taking the barber and service lists down with it, because all three
    // writes share one Dexie transaction.
    const fromPostgres = { ...row, id: true } as unknown as ShopSettings;
    const local = localSettingsRow(fromPostgres);

    expect(local.id).toBe("current");
    expect(typeof local.id).toBe("string");
  });

  it("keeps every setting the app reads", () => {
    expect(localSettingsRow(row)).toMatchObject(row);
  });
});
