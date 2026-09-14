import { describe, expect, it } from "vitest";
import {
  reconcile,
  type FlagKind,
  type PosTransaction
} from "../supabase/functions/_shared/reconciliation.ts";
import { at, cashCount, cashOnly, input, momo, txn } from "./helpers.ts";

function kinds(flags: { kind: FlagKind }[]): FlagKind[] {
  return flags.map((f) => f.kind);
}

/** n cash cuts at GHS 40, spread across opening hours. */
function cuts(n: number): PosTransaction[] {
  return Array.from({ length: n }, (_, i) =>
    txn({ amount: 40, created_at_local: at(`${String(9 + (i % 10)).padStart(2, "0")}:00`) })
  );
}

/**
 * The shop can run without mobile money and switch it on later with one flag.
 * These tests pin down that it is genuinely useful in that state rather than
 * merely not crashing — and that turning MoMo on is a setting, not a rewrite.
 */
describe("cash-only operation", () => {
  it("runs a clean day end to end with no MoMo at all", () => {
    const report = reconcile(
      input({
        posTransactions: [
          txn({ amount: 40, created_at_local: at("09:00") }),
          txn({ amount: 60, created_at_local: at("11:00") }),
          txn({ amount: 40, created_at_local: at("15:00") })
        ],
        cashCount: cashCount(340),
        settings: cashOnly()
      })
    );

    expect(report.flags).toEqual([]);
    expect(report.severity).toBe("NONE");
    expect(report.revenue_total).toBe(140);
    expect(report.cash_share_pct).toBe(100);
  });

  it("reports that Check A did not run, rather than reporting it as passed", () => {
    const report = reconcile(
      input({ posTransactions: cuts(8), cashCount: cashCount(520), settings: cashOnly() })
    );

    expect(report.momo_checked).toBe(false);
    expect(report.digital_total).toBe(0);
    expect(report.matches).toEqual([]);
  });

  it("still catches a cash variance — the drawer check does not depend on MoMo", () => {
    const report = reconcile(
      input({
        posTransactions: [txn({ amount: 100 })],
        cashCount: cashCount(240),
        settings: cashOnly()
      })
    );

    expect(report.cash_variance).toBe(-60);
    expect(kinds(report.flags)).toContain("cash_variance");
    expect(report.severity).toBe("MEDIUM");
  });

  it("still catches a volume drop — the only counter-check for unlogged cash", () => {
    const report = reconcile(
      input({
        posTransactions: cuts(3),
        cashCount: cashCount(320),
        baseline: {
          sameWeekdayCounts: [10, 12, 11, 10, 9, 10, 11, 10],
          barberDailyCounts: {},
          cashRatios: []
        },
        settings: cashOnly()
      })
    );

    expect(report.volume_drop_pct).toBe(70);
    expect(kinds(report.flags)).toContain("volume_drop");
    expect(report.severity).toBe("MEDIUM");
  });

  it("does not cry wolf about digital money that was never expected", () => {
    // The whole point of the switch: without it, every cash-only night would
    // report a digital variance against an empty feed.
    const report = reconcile(
      input({ posTransactions: cuts(10), cashCount: cashCount(600), settings: cashOnly() })
    );

    expect(kinds(report.flags)).not.toContain("unmatched_pos_digital");
    expect(kinds(report.flags)).not.toContain("unmatched_momo");
    expect(report.severity).toBe("NONE");
  });

  it("says so once if a digital sale gets logged while the shop is cash only", () => {
    const report = reconcile(
      input({
        posTransactions: [
          txn({ amount: 40 }),
          txn({ amount: 60, payment_method: "momo", created_at_local: at("12:00") }),
          txn({ amount: 25, payment_method: "card", created_at_local: at("13:00") })
        ],
        cashCount: cashCount(240),
        settings: cashOnly()
      })
    );

    const raised = report.flags.filter((f) => f.kind === "digital_without_momo_feed");
    // One flag about the mismatch, not one per digital row.
    expect(raised).toHaveLength(1);
    expect(raised[0].severity).toBe("MEDIUM");
    expect(raised[0].message).toContain("cash only");
    expect(kinds(report.flags)).not.toContain("unmatched_pos_digital");
    expect(report.severity).toBe("MEDIUM");
  });

  it("says so if MoMo money arrives for a shop nobody turned MoMo on for", () => {
    const report = reconcile(
      input({
        posTransactions: cuts(5),
        momoPayments: [momo({ amount: 50, timestamp: at("10:00") })],
        cashCount: cashCount(400),
        settings: cashOnly()
      })
    );

    const raised = report.flags.filter((f) => f.kind === "digital_without_momo_feed");
    expect(raised).toHaveLength(1);
    expect(raised[0].severity).toBe("MEDIUM");
    expect(kinds(report.flags)).not.toContain("unmatched_momo");
  });

  it("does not escalate the digital variance while cash-only", () => {
    // Declared digital with nothing to compare against would otherwise be a
    // 100% variance and a HIGH every single night.
    const report = reconcile(
      input({
        posTransactions: [txn({ amount: 100, payment_method: "momo", created_at_local: at("11:00") })],
        cashCount: cashCount(200),
        settings: cashOnly()
      })
    );

    expect(report.digital_variance).toBe(100);
    expect(report.severity).toBe("MEDIUM"); // the one flag, not HIGH
  });

  it("starts reconciling digital money the moment the flag is turned on", () => {
    // Same day, same rows — only the setting differs.
    const day = {
      posTransactions: [
        txn({ amount: 60, payment_method: "momo", created_at_local: at("14:05") })
      ],
      momoPayments: [momo({ amount: 60, timestamp: at("14:08") })],
      cashCount: cashCount(200)
    };

    const off = reconcile(input({ ...day, settings: cashOnly() }));
    const on = reconcile(input({ ...day, settings: cashOnly({ momo_enabled: true }) }));

    expect(off.momo_checked).toBe(false);
    expect(off.matches).toHaveLength(0);
    expect(kinds(off.flags)).toEqual(["digital_without_momo_feed"]);

    expect(on.momo_checked).toBe(true);
    expect(on.matches).toHaveLength(1);
    expect(on.flags).toEqual([]);
    expect(on.severity).toBe("NONE");
  });
});
