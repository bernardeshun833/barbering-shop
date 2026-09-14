import { describe, expect, it } from "vitest";
import { datesNeedingRevision } from "../supabase/functions/_shared/reconciliation.ts";

/**
 * The nightly job writes a report at 21:30 and never looked at that day again.
 * A tablet offline past closing pushes its rows the next morning carrying the
 * previous day's created_at_local — so the report for that day was wrong, and
 * being stored, it became the baseline the rolling medians learn from.
 */
describe("datesNeedingRevision", () => {
  const reports = [
    { business_date: "2026-03-10", created_at: "2026-03-10T21:30:00.000Z" },
    { business_date: "2026-03-11", created_at: "2026-03-11T21:30:00.000Z" }
  ];

  it("is empty when every sale reached the server before its report was written", () => {
    const transactions = [
      { created_at_local: "2026-03-10T10:00:00.000Z", synced_at: "2026-03-10T10:02:00.000Z" },
      { created_at_local: "2026-03-11T18:00:00.000Z", synced_at: "2026-03-11T18:01:00.000Z" }
    ];

    expect(datesNeedingRevision(reports, transactions)).toEqual([]);
  });

  it("flags a day whose sales synced the next morning", () => {
    const transactions = [
      { created_at_local: "2026-03-11T14:00:00.000Z", synced_at: "2026-03-12T08:15:00.000Z" }
    ];

    expect(datesNeedingRevision(reports, transactions)).toEqual(["2026-03-11"]);
  });

  it("flags a day that has sales but was never reported at all", () => {
    // The cron did not fire, or the function errored. Previously this could
    // only be fixed by someone noticing and re-running it by hand.
    const transactions = [
      { created_at_local: "2026-03-09T11:00:00.000Z", synced_at: "2026-03-09T11:01:00.000Z" }
    ];

    expect(datesNeedingRevision(reports, transactions)).toEqual(["2026-03-09"]);
  });

  it("returns several stale days oldest first, so each rebuild sees corrected history", () => {
    const transactions = [
      { created_at_local: "2026-03-11T14:00:00.000Z", synced_at: "2026-03-12T08:15:00.000Z" },
      { created_at_local: "2026-03-10T09:00:00.000Z", synced_at: "2026-03-12T08:15:00.000Z" }
    ];

    expect(datesNeedingRevision(reports, transactions)).toEqual(["2026-03-10", "2026-03-11"]);
  });

  it("names each stale day once however many late rows it has", () => {
    const transactions = Array.from({ length: 20 }, () => ({
      created_at_local: "2026-03-11T14:00:00.000Z",
      synced_at: "2026-03-12T08:15:00.000Z"
    }));

    expect(datesNeedingRevision(reports, transactions)).toEqual(["2026-03-11"]);
  });

  it("does not flag a day where only some rows were late", () => {
    // One late row is enough — the day still has to be recalculated.
    const transactions = [
      { created_at_local: "2026-03-11T09:00:00.000Z", synced_at: "2026-03-11T09:01:00.000Z" },
      { created_at_local: "2026-03-11T19:50:00.000Z", synced_at: "2026-03-12T07:00:00.000Z" }
    ];

    expect(datesNeedingRevision(reports, transactions)).toEqual(["2026-03-11"]);
  });

  it("ignores a sale that synced moments before the report was written", () => {
    const transactions = [
      { created_at_local: "2026-03-11T21:29:00.000Z", synced_at: "2026-03-11T21:29:30.000Z" }
    ];

    expect(datesNeedingRevision(reports, transactions)).toEqual([]);
  });

  it("is empty when there are no transactions at all", () => {
    expect(datesNeedingRevision(reports, [])).toEqual([]);
  });
});
