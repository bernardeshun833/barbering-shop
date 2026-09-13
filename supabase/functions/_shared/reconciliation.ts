/**
 * Nightly reconciliation — pure logic.
 *
 * Deliberately free of I/O and Deno APIs so it can be unit-tested directly
 * (see tests/reconciliation.test.ts). The edge function handler does the
 * fetching and sending; everything that decides what the numbers mean lives
 * here.
 *
 * Implements the spec's `nightly_reconciliation(business_date)` pseudocode.
 * Where the pseudocode left something underspecified, the choice made is
 * called out in a comment.
 */

export type PaymentMethod = "cash" | "momo" | "qr" | "card";
export type Severity = "NONE" | "LOW" | "MEDIUM" | "HIGH";

const SEVERITY_ORDER: Severity[] = ["NONE", "LOW", "MEDIUM", "HIGH"];

export const DIGITAL_METHODS: PaymentMethod[] = ["momo", "qr", "card"];

export interface PosTransaction {
  id: string;
  barber_id: string;
  service_id: string;
  amount: number;
  payment_method: PaymentMethod;
  corrects_transaction_id: string | null;
  created_at_local: string;
  synced_at: string;
  device_id: string;
}

export interface MomoPayment {
  id: string;
  external_ref: string;
  amount: number;
  timestamp: string;
}

export interface CashCountRow {
  counted_by: string;
  actual: number;
  opening_float: number;
  notes: string | null;
}

export interface DeviceGap {
  device_id: string;
  gap_hours: number;
  started_at: string;
  ended_at: string;
}

export interface Baseline {
  /** Effective transaction counts for the same weekday, most recent 8 weeks. */
  sameWeekdayCounts: number[];
  /** Per-barber daily transaction counts over the last 30 days. */
  barberDailyCounts: Record<string, number[]>;
  /** Daily cash share (0..1) over the recent history. */
  cashRatios: number[];
}

export interface ReconciliationSettings {
  opening_float: number;
  open_time: string;
  close_time: string;
  digital_variance_pct_threshold: number;
  cash_variance_threshold: number;
  volume_drop_pct_threshold: number;
  cash_ratio_spike_multiplier: number;
  barber_volume_drop_multiplier: number;
  offline_gap_hours: number;
  momo_match_amount_tolerance: number;
  momo_match_window_minutes: number;
}

export interface ReconciliationInput {
  businessDate: string;
  posTransactions: PosTransaction[];
  momoPayments: MomoPayment[];
  cashCount: CashCountRow | null;
  deviceGaps: DeviceGap[];
  baseline: Baseline;
  settings: ReconciliationSettings;
}

export type FlagKind =
  | "unmatched_momo"
  | "unmatched_pos_digital"
  | "cash_variance"
  | "missing_cash_count"
  | "volume_drop"
  | "barber_volume_drop"
  | "cash_ratio_spike"
  | "after_hours_transaction"
  | "extended_offline_period";

export interface Flag {
  kind: FlagKind;
  severity: Severity;
  /** One line the owner can read without decoding it. */
  message: string;
  details?: Record<string, unknown>;
}

export interface BarberBreakdown {
  barber_id: string;
  txn_count: number;
  revenue: number;
  cash_revenue: number;
  digital_revenue: number;
}

export interface BusinessDateReport {
  business_date: string;
  severity: Severity;
  revenue_total: number;
  txn_count: number;
  cash_total: number;
  digital_total: number;
  cash_share_pct: number;
  momo_actual_total: number;
  digital_variance: number;
  digital_variance_pct: number;
  expected_cash: number;
  cash_counted: number | null;
  cash_variance: number | null;
  expected_txn_count: number | null;
  volume_drop_pct: number | null;
  per_barber: BarberBreakdown[];
  matches: { transaction_id: string; momo_payment_id: string }[];
  unmatched_momo: MomoPayment[];
  unmatched_pos_digital: PosTransaction[];
  corrections: { correction_id: string; corrects: string; amount: number }[];
  flags: Flag[];
  baseline_available: boolean;
}

export function maxSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_ORDER.indexOf(a) >= SEVERITY_ORDER.indexOf(b) ? a : b;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function isDigital(method: PaymentMethod): boolean {
  return DIGITAL_METHODS.includes(method);
}

/** Minutes as a number, from "HH:MM" or "HH:MM:SS". */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Ghana is UTC+0 year round, so the device's ISO timestamp is already local
 * time. If this system is ever deployed somewhere with an offset, this is the
 * single place that needs to learn about it.
 */
function localMinutesOfDay(isoTimestamp: string): number {
  const date = new Date(isoTimestamp);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

export function reconcile(input: ReconciliationInput): BusinessDateReport {
  const { posTransactions, momoPayments, cashCount, deviceGaps, baseline, settings } =
    input;

  const flags: Flag[] = [];
  let severity: Severity = "NONE";
  const flag = (f: Flag) => {
    flags.push(f);
    severity = maxSeverity(severity, f.severity);
  };

  // ---- Corrections -------------------------------------------------------
  // A void is a negative correction row pointing at the original. Money-wise
  // the pair nets to zero under a plain SUM. Count-wise both rows must drop
  // out, or a busy day of corrections would look like a busy day of sales.
  const corrections = posTransactions.filter((t) => t.corrects_transaction_id !== null);
  const correctedIds = new Set(corrections.map((t) => t.corrects_transaction_id!));

  const effectiveSales = posTransactions.filter(
    (t) => t.corrects_transaction_id === null && !correctedIds.has(t.id)
  );

  // ---- 2. Split POS by declared payment method ---------------------------
  // Sums run over ALL rows including corrections, so a void genuinely removes
  // its revenue. Counts run over effective sales only.
  const posCashTotal = round2(
    posTransactions
      .filter((t) => t.payment_method === "cash")
      .reduce((sum, t) => sum + t.amount, 0)
  );
  const posDigitalTotal = round2(
    posTransactions
      .filter((t) => isDigital(t.payment_method))
      .reduce((sum, t) => sum + t.amount, 0)
  );
  const momoActualTotal = round2(momoPayments.reduce((sum, p) => sum + p.amount, 0));
  const revenueTotal = round2(posCashTotal + posDigitalTotal);
  const txnCount = effectiveSales.length;

  // ---- 3. Check A — digital declared vs digital actually received --------
  const digitalVariance = round2(posDigitalTotal - momoActualTotal);
  const digitalVariancePct =
    round2((digitalVariance / Math.max(momoActualTotal, 1)) * 100);

  // Candidates are digital sales that were not voided. A voided sale whose
  // MoMo money did arrive should surface as unmatched_momo — that pairing is
  // exactly the case worth a question.
  const candidates = effectiveSales.filter((t) => isDigital(t.payment_method));
  const matchedPosIds = new Set<string>();
  const matches: { transaction_id: string; momo_payment_id: string }[] = [];
  const unmatchedMomo: MomoPayment[] = [];

  const windowMs = settings.momo_match_window_minutes * 60 * 1000;

  for (const payment of momoPayments) {
    const paymentTime = new Date(payment.timestamp).getTime();

    const eligible = candidates
      .filter((t) => !matchedPosIds.has(t.id))
      .filter(
        (t) => Math.abs(t.amount - payment.amount) < settings.momo_match_amount_tolerance
      )
      .map((t) => ({
        txn: t,
        distance: Math.abs(new Date(t.created_at_local).getTime() - paymentTime)
      }))
      .filter((c) => c.distance < windowMs)
      // The spec says "FIND pos_txn WHERE ..." without saying which one when
      // several qualify — common, since a shop sells the same haircut at the
      // same price all day. Closest in time is deterministic and is the
      // pairing a human would make.
      .sort((a, b) => a.distance - b.distance);

    const best = eligible[0];
    if (best) {
      matchedPosIds.add(best.txn.id);
      matches.push({ transaction_id: best.txn.id, momo_payment_id: payment.id });
    } else {
      unmatchedMomo.push(payment);
      flag({
        kind: "unmatched_momo",
        severity: "HIGH",
        message: `GHS ${payment.amount.toFixed(2)} received on MoMo at ${new Date(
          payment.timestamp
        ).toISOString().slice(11, 16)} with no matching sale logged`,
        details: { external_ref: payment.external_ref, amount: payment.amount }
      });
    }
  }

  const unmatchedPosDigital = candidates.filter((t) => !matchedPosIds.has(t.id));
  if (unmatchedPosDigital.length > 0) {
    const total = round2(unmatchedPosDigital.reduce((s, t) => s + t.amount, 0));
    flag({
      kind: "unmatched_pos_digital",
      severity: "HIGH",
      message: `${unmatchedPosDigital.length} digital sale(s) totalling GHS ${total.toFixed(
        2
      )} logged, but no matching money arrived`,
      details: { transaction_ids: unmatchedPosDigital.map((t) => t.id), total }
    });
  }

  if (Math.abs(digitalVariancePct) > settings.digital_variance_pct_threshold) {
    severity = maxSeverity(severity, "HIGH");
  }

  // ---- 4. Check B — cash declared vs cash counted ------------------------
  // expected_cash is recomputed here from POS data rather than trusting the
  // `expected` the tablet submitted, so a wrong number on the device cannot
  // paper over a real variance.
  const openingFloat = cashCount?.opening_float ?? settings.opening_float;
  const expectedCash = round2(posCashTotal + openingFloat);
  const cashVariance = cashCount ? round2(cashCount.actual - expectedCash) : null;

  if (!cashCount) {
    flag({
      kind: "missing_cash_count",
      severity: "MEDIUM",
      message: "No end-of-shift cash count was recorded",
      details: {}
    });
  } else if (Math.abs(cashVariance!) > settings.cash_variance_threshold) {
    flag({
      kind: "cash_variance",
      severity: "MEDIUM",
      message: `Drawer is ${cashVariance! > 0 ? "over" : "short"} by GHS ${Math.abs(
        cashVariance!
      ).toFixed(2)} (counted ${cashCount.actual.toFixed(2)}, expected ${expectedCash.toFixed(
        2
      )})`,
      details: { counted_by: cashCount.counted_by, notes: cashCount.notes }
    });
  }

  // ---- 5. Check C — volume sanity ---------------------------------------
  // Skipped entirely until there is history to compare against: during the
  // first weeks a median over an empty window would either fire constantly or
  // read as "fine" for reasons that have nothing to do with the day's trade.
  const expectedCount = median(baseline.sameWeekdayCounts);
  const baselineAvailable = expectedCount !== null;

  let volumeDropPct: number | null = null;
  if (expectedCount !== null) {
    volumeDropPct = round2(
      ((expectedCount - txnCount) / Math.max(expectedCount, 1)) * 100
    );
    if (volumeDropPct > settings.volume_drop_pct_threshold) {
      flag({
        kind: "volume_drop",
        severity: "MEDIUM",
        message: `${volumeDropPct.toFixed(0)}% fewer sales than a typical ${new Date(
          input.businessDate
        ).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" })} (${txnCount} vs ${expectedCount} typical)`,
        details: { txn_count: txnCount, expected_count: expectedCount }
      });
    }
  }

  const perBarber = buildBarberBreakdown(effectiveSales, posTransactions);

  for (const barber of perBarber) {
    const history = baseline.barberDailyCounts[barber.barber_id] ?? [];
    const barberMedian = median(history);
    if (barberMedian === null || barberMedian === 0) continue;
    if (barber.txn_count < barberMedian * settings.barber_volume_drop_multiplier) {
      flag({
        kind: "barber_volume_drop",
        severity: "LOW",
        message: `${barber.barber_id} logged ${barber.txn_count} cuts against a usual ${barberMedian}`,
        details: { barber_id: barber.barber_id, txn_count: barber.txn_count, usual: barberMedian }
      });
    }
  }

  // ---- 6. Check D — behavioural anomalies -------------------------------
  const cashShare =
    revenueTotal > 0 ? posCashTotal / (posCashTotal + posDigitalTotal) : 0;
  const cashRatioMedian = median(baseline.cashRatios);

  if (
    cashRatioMedian !== null &&
    cashRatioMedian > 0 &&
    revenueTotal > 0 &&
    cashShare > cashRatioMedian * settings.cash_ratio_spike_multiplier
  ) {
    flag({
      kind: "cash_ratio_spike",
      severity: "LOW",
      message: `Cash was ${(cashShare * 100).toFixed(0)}% of takings, against a usual ${(
        cashRatioMedian * 100
      ).toFixed(0)}%`,
      details: { cash_share: round2(cashShare), usual: round2(cashRatioMedian) }
    });
  }

  const openMinutes = timeToMinutes(settings.open_time);
  const closeMinutes = timeToMinutes(settings.close_time);
  const afterHours = posTransactions.filter((t) => {
    const minutes = localMinutesOfDay(t.created_at_local);
    return minutes < openMinutes || minutes >= closeMinutes;
  });

  if (afterHours.length > 0) {
    flag({
      kind: "after_hours_transaction",
      severity: "LOW",
      message: `${afterHours.length} sale(s) logged outside ${settings.open_time}–${settings.close_time}`,
      details: {
        transaction_ids: afterHours.map((t) => t.id),
        times: afterHours.map((t) => t.created_at_local)
      }
    });
  }

  const longGaps = deviceGaps.filter((g) => g.gap_hours > settings.offline_gap_hours);
  for (const gap of longGaps) {
    flag({
      kind: "extended_offline_period",
      severity: "LOW",
      message: `Tablet ${gap.device_id} did not sync for ${gap.gap_hours.toFixed(
        1
      )} hours during opening hours`,
      details: gap as unknown as Record<string, unknown>
    });
  }

  return {
    business_date: input.businessDate,
    severity,
    revenue_total: revenueTotal,
    txn_count: txnCount,
    cash_total: posCashTotal,
    digital_total: posDigitalTotal,
    cash_share_pct: round2(cashShare * 100),
    momo_actual_total: momoActualTotal,
    digital_variance: digitalVariance,
    digital_variance_pct: digitalVariancePct,
    expected_cash: expectedCash,
    cash_counted: cashCount?.actual ?? null,
    cash_variance: cashVariance,
    expected_txn_count: expectedCount,
    volume_drop_pct: volumeDropPct,
    per_barber: perBarber,
    matches,
    unmatched_momo: unmatchedMomo,
    unmatched_pos_digital: unmatchedPosDigital,
    corrections: corrections.map((c) => ({
      correction_id: c.id,
      corrects: c.corrects_transaction_id!,
      amount: c.amount
    })),
    flags,
    baseline_available: baselineAvailable
  };
}

/**
 * Longest stretch during opening hours in which a device sent nothing.
 *
 * Every sync leaves a trace — a `synced_at` on the rows it pushed, or a
 * heartbeat row when it had nothing to push. The window is bounded by opening
 * and closing time at both ends, so a tablet that goes quiet at 14:00 and
 * stays quiet counts its silence up to close rather than reporting no gap at
 * all. That is the point of spec rule 5: "no data" is not "no problem".
 */
export function computeDeviceGaps(
  transactions: PosTransaction[],
  heartbeats: { device_id: string; last_synced_at: string }[],
  businessDate: string,
  openTime: string,
  closeTime: string
): DeviceGap[] {
  const openMs = Date.parse(`${businessDate}T${padTime(openTime)}Z`);
  const closeMs = Date.parse(`${businessDate}T${padTime(closeTime)}Z`);

  const syncTimesByDevice = new Map<string, number[]>();
  const record = (deviceId: string, iso: string) => {
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms) || ms < openMs || ms > closeMs) return;
    const times = syncTimesByDevice.get(deviceId) ?? [];
    times.push(ms);
    syncTimesByDevice.set(deviceId, times);
  };

  for (const txn of transactions) {
    if (!syncTimesByDevice.has(txn.device_id)) syncTimesByDevice.set(txn.device_id, []);
    record(txn.device_id, txn.synced_at);
  }
  for (const beat of heartbeats) {
    if (!syncTimesByDevice.has(beat.device_id)) syncTimesByDevice.set(beat.device_id, []);
    record(beat.device_id, beat.last_synced_at);
  }

  const gaps: DeviceGap[] = [];

  for (const [deviceId, times] of syncTimesByDevice) {
    const points = [openMs, ...times.sort((a, b) => a - b), closeMs];
    let longest = 0;
    let start = openMs;

    for (let i = 1; i < points.length; i++) {
      const gap = points[i] - points[i - 1];
      if (gap > longest) {
        longest = gap;
        start = points[i - 1];
      }
    }

    gaps.push({
      device_id: deviceId,
      gap_hours: longest / (60 * 60 * 1000),
      started_at: new Date(start).toISOString(),
      ended_at: new Date(start + longest).toISOString()
    });
  }

  return gaps;
}

function padTime(time: string): string {
  return time.length === 5 ? `${time}:00` : time;
}

function buildBarberBreakdown(
  effectiveSales: PosTransaction[],
  allTransactions: PosTransaction[]
): BarberBreakdown[] {
  const byBarber = new Map<string, BarberBreakdown>();

  const ensure = (barberId: string): BarberBreakdown => {
    let row = byBarber.get(barberId);
    if (!row) {
      row = {
        barber_id: barberId,
        txn_count: 0,
        revenue: 0,
        cash_revenue: 0,
        digital_revenue: 0
      };
      byBarber.set(barberId, row);
    }
    return row;
  };

  for (const txn of effectiveSales) {
    ensure(txn.barber_id).txn_count += 1;
  }

  // Revenue nets corrections in, so a barber's total reflects what actually
  // stood at the end of the day.
  for (const txn of allTransactions) {
    const row = ensure(txn.barber_id);
    row.revenue = round2(row.revenue + txn.amount);
    if (txn.payment_method === "cash") {
      row.cash_revenue = round2(row.cash_revenue + txn.amount);
    } else {
      row.digital_revenue = round2(row.digital_revenue + txn.amount);
    }
  }

  return [...byBarber.values()].sort((a, b) => b.revenue - a.revenue);
}
