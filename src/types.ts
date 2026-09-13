export type PaymentMethod = "cash" | "momo" | "qr" | "card";

export const DIGITAL_METHODS: PaymentMethod[] = ["momo", "qr", "card"];

export interface Barber {
  id: string;
  name: string;
  pin_hash: string;
  pin_salt: string;
  pin_iterations: number;
  commission_rate: number;
  active: boolean;
}

export interface Service {
  id: string;
  name: string;
  price: number;
  active: boolean;
}

export interface ShopSettings {
  opening_float: number;
  open_time: string;
  close_time: string;
  timezone: string;
}

/** A transaction as it lives in the local queue before it reaches Postgres. */
export interface QueuedTransaction {
  /** Client-generated UUID. Doubles as the Postgres primary key, which makes
   *  retries idempotent — a re-sent row collides instead of duplicating. */
  id: string;
  barber_id: string;
  service_id: string;
  amount: number;
  payment_method: PaymentMethod;
  corrects_transaction_id: string | null;
  created_at_local: string;
  device_id: string;
  /** Local-only bookkeeping, stripped before the row is sent. */
  sync_state: "pending" | "synced";
  sync_attempts: number;
  last_error?: string;
}

export interface QueuedCashCount {
  id: string;
  shift_date: string;
  counted_by: string;
  expected: number;
  actual: number;
  opening_float: number;
  notes: string | null;
  device_id: string;
  created_at_local: string;
  sync_state: "pending" | "synced";
  sync_attempts: number;
  last_error?: string;
}
