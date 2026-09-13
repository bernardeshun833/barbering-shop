-- Single-row settings table. The reconciliation job reads its thresholds and
-- business hours from here rather than hard-coding them, so the owner can
-- tune sensitivity without a redeploy.
create table shop_settings (
  id boolean primary key default true check (id),   -- enforces exactly one row
  opening_float numeric(10,2) not null default 200.00,
  open_time time not null default '08:00',
  close_time time not null default '20:00',
  timezone text not null default 'Africa/Accra',

  -- Severity thresholds (spec section 7)
  digital_variance_pct_threshold numeric(6,2) not null default 1.0,
  cash_variance_threshold numeric(10,2) not null default 50.00,
  volume_drop_pct_threshold numeric(6,2) not null default 25.0,
  cash_ratio_spike_multiplier numeric(6,2) not null default 1.3,
  barber_volume_drop_multiplier numeric(6,2) not null default 0.7,
  offline_gap_hours integer not null default 4,

  -- MoMo matching tolerances (spec: exact amount, within 15 minutes)
  momo_match_amount_tolerance numeric(10,2) not null default 0.01,
  momo_match_window_minutes integer not null default 15,

  owner_email text,
  owner_whatsapp text
);

insert into shop_settings (id) values (true);
