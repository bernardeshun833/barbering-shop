import type {
  Baseline,
  MomoPayment,
  PosTransaction,
  ReconciliationInput,
  ReconciliationSettings
} from "../supabase/functions/_shared/reconciliation.ts";

export const DATE = "2026-03-12"; // a Thursday

export const SETTINGS: ReconciliationSettings = {
  opening_float: 200,
  open_time: "08:00",
  close_time: "20:00",
  // On, so the existing suite exercises Check A. The cash-only path — what a
  // shop without a MoMo merchant account actually runs — is covered by
  // cashOnly() below and tests/cash-only.test.ts.
  momo_enabled: true,
  digital_variance_pct_threshold: 1,
  cash_variance_threshold: 50,
  volume_drop_pct_threshold: 25,
  cash_ratio_spike_multiplier: 1.3,
  barber_volume_drop_multiplier: 0.7,
  offline_gap_hours: 4,
  momo_match_amount_tolerance: 0.01,
  momo_match_window_minutes: 15
};

export const EMPTY_BASELINE: Baseline = {
  sameWeekdayCounts: [],
  barberDailyCounts: {},
  cashRatios: []
};

let counter = 0;

export function txn(overrides: Partial<PosTransaction> = {}): PosTransaction {
  counter++;
  const at = overrides.created_at_local ?? `${DATE}T10:00:00.000Z`;
  return {
    id: `txn-${counter}`,
    barber_id: "barber-1",
    service_id: "service-1",
    amount: 40,
    payment_method: "cash",
    corrects_transaction_id: null,
    created_at_local: at,
    synced_at: at,
    device_id: "tablet-1",
    ...overrides
  };
}

export function momo(overrides: Partial<MomoPayment> = {}): MomoPayment {
  counter++;
  return {
    id: `momo-${counter}`,
    external_ref: `ref-${counter}`,
    amount: 40,
    timestamp: `${DATE}T10:00:00.000Z`,
    ...overrides
  };
}

export function at(time: string): string {
  return `${DATE}T${time}:00.000Z`;
}

export function input(overrides: Partial<ReconciliationInput> = {}): ReconciliationInput {
  return {
    businessDate: DATE,
    posTransactions: [],
    momoPayments: [],
    cashCount: null,
    deviceGaps: [],
    baseline: EMPTY_BASELINE,
    settings: SETTINGS,
    ...overrides
  };
}

/** Settings for a shop with no MoMo feed: cash only. */
export function cashOnly(
  overrides: Partial<ReconciliationSettings> = {}
): ReconciliationSettings {
  return { ...SETTINGS, momo_enabled: false, ...overrides };
}

export function cashCount(actual: number, openingFloat = 200) {
  return {
    counted_by: "Ama & Kofi",
    actual,
    opening_float: openingFloat,
    notes: null
  };
}
