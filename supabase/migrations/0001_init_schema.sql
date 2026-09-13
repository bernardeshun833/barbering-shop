-- Kumasi Barbershop POS — core schema
-- See spec section "Data model" and "Hard design rules".

create extension if not exists pgcrypto;

create table barbers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- PBKDF2-SHA256 of the barber's PIN, never the raw PIN. The device must
  -- verify PINs while offline, so these necessarily sync down to the tablet;
  -- a per-barber salt and high iteration count raise the cost of brute
  -- forcing a 4-digit PIN off a stolen device. See docs/security.md — PIN
  -- gating is an attribution mechanism, not a defence against someone who
  -- has the tablet and time.
  pin_hash text not null,
  pin_salt text not null,
  pin_iterations integer not null default 200000,
  commission_rate numeric(5,4) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(10,2) not null check (price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references barbers(id),
  service_id uuid not null references services(id),
  amount numeric(10,2) not null,
  payment_method text not null check (payment_method in ('cash', 'momo', 'qr', 'card')),

  -- Corrections are new rows referencing the original (hard design rule #1).
  -- A void is a correction row carrying the negative of the original amount,
  -- so totals net out under a plain SUM while both rows stay visible.
  corrects_transaction_id uuid references transactions(id),

  -- Only a correction row may be negative.
  constraint transactions_amount_sign check (
    amount >= 0 or corrects_transaction_id is not null
  ),

  created_at_local timestamptz not null,   -- set ON THE DEVICE at entry time
  synced_at timestamptz not null default now(), -- set SERVER-SIDE on insert
  device_id text not null
);

create index transactions_created_at_local_idx on transactions (created_at_local);
create index transactions_barber_id_idx on transactions (barber_id);
create index transactions_device_id_idx on transactions (device_id);
create index transactions_payment_method_idx on transactions (payment_method);
create index transactions_corrects_idx on transactions (corrects_transaction_id);

create table momo_payments (
  id uuid primary key default gen_random_uuid(),
  external_ref text not null unique,   -- MoMo API transaction reference, used for idempotent upserts
  amount numeric(10,2) not null check (amount >= 0),
  timestamp timestamptz not null,
  matched_txn_id uuid references transactions(id),
  fetched_at timestamptz not null default now()
);

create index momo_payments_timestamp_idx on momo_payments (timestamp);

create table cash_counts (
  id uuid primary key default gen_random_uuid(),
  shift_date date not null,
  counted_by text not null,      -- names of both counters, e.g. "Ama & Kofi"
  expected numeric(10,2) not null,
  actual numeric(10,2) not null,
  variance numeric(10,2) generated always as (actual - expected) stored,
  opening_float numeric(10,2) not null default 0,
  notes text,
  device_id text not null,
  created_at_local timestamptz not null,
  synced_at timestamptz not null default now(),

  unique (shift_date)
);

-- Device heartbeat / silence detection (spec rule 5: "device silence is a
-- signal"). Updated by the sync engine on every successful sync batch.
create table device_heartbeats (
  device_id text primary key,
  last_synced_at timestamptz not null default now(),
  last_seen_ip inet
);

-- Output of the nightly reconciliation job, stored to build the historical
-- baseline the rolling-median checks depend on (spec: "STORE report").
create table reconciliation_reports (
  id uuid primary key default gen_random_uuid(),
  business_date date not null unique,
  severity text not null check (severity in ('NONE', 'LOW', 'MEDIUM', 'HIGH')),
  revenue_total numeric(10,2) not null,
  txn_count integer not null,
  report jsonb not null,           -- full structured report (see reconciliation.ts BusinessDateReport)
  created_at timestamptz not null default now()
);

create index reconciliation_reports_date_idx on reconciliation_reports (business_date);
