import { describe, expect, it } from "vitest";
import { emailHtml, emailSubject, type Revision } from "../supabase/functions/_shared/report.ts";
import {
  reconcile,
  type BusinessDateReport
} from "../supabase/functions/_shared/reconciliation.ts";
import { cashCount, cashOnly, input, momo, txn, at } from "./helpers.ts";

const NAMES = { "barber-1": "Kwame Mensah" };

function cleanDay(): BusinessDateReport {
  return reconcile(
    input({ posTransactions: [txn({ amount: 40 })], cashCount: cashCount(240) })
  );
}

describe("daily email", () => {
  it("shows the MoMo comparison when Check A ran", () => {
    const report = reconcile(
      input({
        posTransactions: [txn({ amount: 60, payment_method: "momo", created_at_local: at("11:00") })],
        momoPayments: [momo({ amount: 60, timestamp: at("11:02") })],
        cashCount: cashCount(200)
      })
    );

    const html = emailHtml(report, NAMES);
    expect(html).toContain("Digital logged vs MoMo received");
    expect(html).toContain("Cash, MoMo and the POS all agree.");
  });

  it("says MoMo was not checked on a cash-only day, rather than implying it passed", () => {
    const report = reconcile(
      input({ posTransactions: [txn({ amount: 40 })], cashCount: cashCount(240), settings: cashOnly() })
    );

    const html = emailHtml(report, NAMES);
    expect(html).toContain("cash only — not checked");
    expect(html).not.toContain("Digital logged vs MoMo received");
    expect(html).not.toContain("Cash, MoMo and the POS all agree.");
  });

  it("renders reports stored before cash-only mode existed as MoMo-checked", () => {
    // Older rows have no momo_checked field at all, and every one of them was
    // produced with Check A running.
    const legacy = { ...cleanDay() } as Record<string, unknown>;
    delete legacy.momo_checked;

    expect(emailHtml(legacy as never, NAMES)).toContain("Digital logged vs MoMo received");
  });

  it("puts the severity in the subject only when something needs attention", () => {
    const clean = cleanDay();
    expect(emailSubject(clean)).not.toContain("[");

    const alarming = reconcile(
      input({ posTransactions: [txn({ amount: 40 })], momoPayments: [momo({ amount: 50 })], cashCount: cashCount(240) })
    );
    expect(emailSubject(alarming)).toContain("Needs attention");
  });
});

describe("revised earlier days", () => {
  const revision = (over: Partial<Revision> = {}): Revision => ({
    business_date: "2026-03-11",
    previous: { revenue_total: 120, txn_count: 3, severity: "NONE" },
    current: { revenue_total: 400, txn_count: 10, severity: "NONE" },
    ...over
  });

  it("says nothing at all when no earlier day changed", () => {
    expect(emailHtml(cleanDay(), NAMES, [])).not.toContain("Revised earlier days");
  });

  it("shows what the owner was told against what the day actually was", () => {
    const html = emailHtml(cleanDay(), NAMES, [revision()]);

    expect(html).toContain("Revised earlier days");
    expect(html).toContain("2026-03-11");
    expect(html).toContain("GHS 120.00 · 3 cuts"); // what was reported
    expect(html).toContain("GHS 400.00 · 10 cuts"); // what it actually was
  });

  it("is explicit when a day had never been reported at all", () => {
    const html = emailHtml(cleanDay(), NAMES, [revision({ previous: null })]);
    expect(html).toContain("not reported at the time");
  });

  it("marks a revised day that turns out to need attention", () => {
    const html = emailHtml(
      cleanDay(),
      NAMES,
      [revision({ current: { revenue_total: 400, txn_count: 10, severity: "HIGH" } })]
    );

    expect(html).toContain("Needs attention today");
  });

  it("lists every revised day", () => {
    const html = emailHtml(cleanDay(), NAMES, [
      revision({ business_date: "2026-03-10" }),
      revision({ business_date: "2026-03-11" })
    ]);

    expect(html).toContain("2026-03-10");
    expect(html).toContain("2026-03-11");
    expect(html).toContain("these days");
  });
});
