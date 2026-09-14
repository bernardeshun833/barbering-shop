import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  computeDeviceGaps,
  datesNeedingRevision,
  reconcile,
  type Baseline,
  type BusinessDateReport,
  type CashCountRow,
  type MomoPayment,
  type PosTransaction,
  type ReconciliationSettings
} from "../_shared/reconciliation.ts";
import { emailHtml, emailSubject, whatsappAlert, type Revision } from "../_shared/report.ts";
import { sendEmail, sendWhatsApp } from "../_shared/notify.ts";

/**
 * How far back to look for days whose data arrived after their report was
 * written. Generous on purpose: a tablet can be off the network for a week in
 * a place with unreliable connectivity, and the scan is one extra query on a
 * table this shop adds a few dozen rows a day to.
 */
const REVISION_WINDOW_DAYS = 14;

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Cron fires at 21:30 local, so "today" is the business day that just
  // closed. An explicit ?date= lets a missed night be re-run by hand.
  const url = new URL(req.url);
  const explicitDate = url.searchParams.get("date");
  const businessDate = explicitDate ?? new Date().toISOString().slice(0, 10);

  try {
    // A manual ?date= run means "reconcile exactly that day" — don't let it
    // quietly rewrite a fortnight of history as a side effect.
    const revisions = explicitDate ? [] : await reviseStaleDates(supabase, businessDate);

    const report = await runReconciliation(supabase, businessDate);
    const delivery = await deliver(supabase, report, revisions);

    return Response.json({
      ok: true,
      severity: report.severity,
      revised: revisions.map((r) => r.business_date),
      delivery
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("nightly-reconciliation failed", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
});

/**
 * Re-reconcile any earlier day whose data has changed since it was reported,
 * oldest first so each rebuild sees corrected history behind it. Returns only
 * the days whose numbers actually moved — a re-run that lands on the same
 * figures is not news, and the owner should not be told a day was "revised"
 * when nothing about it changed.
 */
async function reviseStaleDates(
  supabase: SupabaseClient,
  businessDate: string
): Promise<Revision[]> {
  const windowStart = new Date(
    Date.parse(`${businessDate}T00:00:00Z`) - REVISION_WINDOW_DAYS * 24 * 60 * 60 * 1000
  )
    .toISOString()
    .slice(0, 10);

  const [reportsRes, txnRes] = await Promise.all([
    supabase
      .from("reconciliation_reports")
      .select("business_date, created_at, revenue_total, txn_count, severity")
      .gte("business_date", windowStart)
      .lt("business_date", businessDate),
    supabase
      .from("transactions")
      .select("created_at_local, synced_at")
      .gte("created_at_local", `${windowStart}T00:00:00Z`)
      .lt("created_at_local", `${businessDate}T00:00:00Z`)
  ]);

  if (reportsRes.error) throw new Error(`revision scan reports: ${reportsRes.error.message}`);
  if (txnRes.error) throw new Error(`revision scan transactions: ${txnRes.error.message}`);

  const previous = new Map(
    (reportsRes.data ?? []).map((r) => [
      r.business_date as string,
      {
        revenue_total: Number(r.revenue_total),
        txn_count: Number(r.txn_count),
        severity: r.severity as BusinessDateReport["severity"]
      }
    ])
  );

  const stale = datesNeedingRevision(reportsRes.data ?? [], txnRes.data ?? []);
  const revisions: Revision[] = [];

  for (const date of stale) {
    const before = previous.get(date) ?? null;
    const after = await runReconciliation(supabase, date);

    const changed =
      before === null ||
      before.revenue_total !== after.revenue_total ||
      before.txn_count !== after.txn_count ||
      before.severity !== after.severity;

    if (changed) {
      revisions.push({
        business_date: date,
        previous: before,
        current: {
          revenue_total: after.revenue_total,
          txn_count: after.txn_count,
          severity: after.severity
        }
      });
    }
  }

  return revisions;
}

async function runReconciliation(
  supabase: SupabaseClient,
  businessDate: string
): Promise<BusinessDateReport> {
  const dayStart = `${businessDate}T00:00:00Z`;
  const dayEnd = `${businessDate}T23:59:59.999Z`;

  const settingsRow = await supabase.from("shop_settings").select("*").single();
  if (settingsRow.error) throw new Error(`settings: ${settingsRow.error.message}`);
  const settings = settingsRow.data as ReconciliationSettings & {
    owner_email: string | null;
    owner_whatsapp: string | null;
  };

  // 1. Gather the three independent sources.
  const [txnRes, momoRes, cashRes, heartbeatRes] = await Promise.all([
    supabase
      .from("transactions")
      .select("*")
      .gte("created_at_local", dayStart)
      .lte("created_at_local", dayEnd),
    supabase
      .from("momo_payments")
      .select("*")
      .gte("timestamp", dayStart)
      .lte("timestamp", dayEnd),
    supabase.from("cash_counts").select("*").eq("shift_date", businessDate).maybeSingle(),
    supabase.from("device_heartbeats").select("device_id, last_synced_at")
  ]);

  if (txnRes.error) throw new Error(`transactions: ${txnRes.error.message}`);
  if (momoRes.error) throw new Error(`momo_payments: ${momoRes.error.message}`);
  if (cashRes.error) throw new Error(`cash_counts: ${cashRes.error.message}`);
  if (heartbeatRes.error) throw new Error(`device_heartbeats: ${heartbeatRes.error.message}`);

  const posTransactions = (txnRes.data ?? []).map(toPosTransaction);
  const momoPayments = (momoRes.data ?? []).map(toMomoPayment);
  const cashCount = cashRes.data ? toCashCount(cashRes.data) : null;

  const deviceGaps = computeDeviceGaps(
    posTransactions,
    heartbeatRes.data ?? [],
    businessDate,
    settings.open_time,
    settings.close_time
  );

  const baseline = await loadBaseline(supabase, businessDate);

  const report = reconcile({
    businessDate,
    posTransactions,
    momoPayments,
    cashCount,
    deviceGaps,
    baseline,
    settings
  });

  await persist(supabase, report);
  return report;
}

/**
 * The baseline comes from previously stored reports rather than from the raw
 * transaction table. Stored reports already exclude voided entries and are
 * cheap to scan — and it means the rolling medians are built from the same
 * numbers the owner was shown, not a recomputation that might quietly differ.
 */
async function loadBaseline(
  supabase: SupabaseClient,
  businessDate: string
): Promise<Baseline> {
  const since = new Date(Date.parse(`${businessDate}T00:00:00Z`) - 60 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const { data, error } = await supabase
    .from("reconciliation_reports")
    .select("business_date, txn_count, report")
    .gte("business_date", since)
    .lt("business_date", businessDate)
    .order("business_date", { ascending: false });

  if (error) throw new Error(`baseline: ${error.message}`);

  const rows = (data ?? []) as {
    business_date: string;
    txn_count: number;
    report: BusinessDateReport;
  }[];

  const targetWeekday = new Date(`${businessDate}T00:00:00Z`).getUTCDay();

  const sameWeekdayCounts = rows
    .filter((r) => new Date(`${r.business_date}T00:00:00Z`).getUTCDay() === targetWeekday)
    .slice(0, 8)
    .map((r) => r.txn_count);

  const thirtyDaysAgo = new Date(
    Date.parse(`${businessDate}T00:00:00Z`) - 30 * 24 * 60 * 60 * 1000
  )
    .toISOString()
    .slice(0, 10);

  const recent = rows.filter((r) => r.business_date >= thirtyDaysAgo);

  const barberDailyCounts: Record<string, number[]> = {};
  const cashRatios: number[] = [];

  for (const row of recent) {
    for (const barber of row.report?.per_barber ?? []) {
      (barberDailyCounts[barber.barber_id] ??= []).push(barber.txn_count);
    }
    if (typeof row.report?.cash_share_pct === "number" && row.report.revenue_total > 0) {
      cashRatios.push(row.report.cash_share_pct / 100);
    }
  }

  return { sameWeekdayCounts, barberDailyCounts, cashRatios };
}

async function persist(
  supabase: SupabaseClient,
  report: BusinessDateReport
): Promise<void> {
  if (report.matches.length > 0) {
    await supabase.from("transaction_matches").upsert(
      report.matches.map((m) => ({
        transaction_id: m.transaction_id,
        momo_payment_id: m.momo_payment_id
      })),
      { onConflict: "transaction_id" }
    );

    for (const match of report.matches) {
      await supabase
        .from("momo_payments")
        .update({ matched_txn_id: match.transaction_id })
        .eq("id", match.momo_payment_id);
    }
  }

  // Re-running a day overwrites its report; the transactions behind it are
  // still append-only, so nothing about the underlying record changes.
  const { error } = await supabase.from("reconciliation_reports").upsert(
    {
      business_date: report.business_date,
      severity: report.severity,
      revenue_total: report.revenue_total,
      txn_count: report.txn_count,
      report
    },
    { onConflict: "business_date" }
  );

  if (error) throw new Error(`store report: ${error.message}`);
}

async function deliver(
  supabase: SupabaseClient,
  report: BusinessDateReport,
  revisions: Revision[]
) {
  const { data: settings } = await supabase
    .from("shop_settings")
    .select("owner_email, owner_whatsapp")
    .single();

  const { data: barbers } = await supabase.from("barbers").select("id, name");
  const barberNames = Object.fromEntries(
    (barbers ?? []).map((b: { id: string; name: string }) => [b.id, b.name])
  );

  // Every single day, even when clean.
  const email = settings?.owner_email
    ? await sendEmail({
        to: settings.owner_email,
        subject: emailSubject(report),
        html: emailHtml(report, barberNames, revisions)
      })
    : { ok: false, skipped: "owner_email not set" };

  const escalate = report.severity === "MEDIUM" || report.severity === "HIGH";
  const whatsapp =
    escalate && settings?.owner_whatsapp
      ? await sendWhatsApp({ to: settings.owner_whatsapp, body: whatsappAlert(report) })
      : { ok: true, skipped: escalate ? "owner_whatsapp not set" : "severity below MEDIUM" };

  return { email, whatsapp };
}

function toPosTransaction(row: Record<string, unknown>): PosTransaction {
  return {
    id: row.id as string,
    barber_id: row.barber_id as string,
    service_id: row.service_id as string,
    amount: Number(row.amount),
    payment_method: row.payment_method as PosTransaction["payment_method"],
    corrects_transaction_id: (row.corrects_transaction_id as string | null) ?? null,
    created_at_local: row.created_at_local as string,
    synced_at: row.synced_at as string,
    device_id: row.device_id as string
  };
}

function toMomoPayment(row: Record<string, unknown>): MomoPayment {
  return {
    id: row.id as string,
    external_ref: row.external_ref as string,
    amount: Number(row.amount),
    timestamp: row.timestamp as string
  };
}

function toCashCount(row: Record<string, unknown>): CashCountRow {
  return {
    counted_by: row.counted_by as string,
    actual: Number(row.actual),
    opening_float: Number(row.opening_float),
    notes: (row.notes as string | null) ?? null
  };
}
