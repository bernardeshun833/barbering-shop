-- Row Level Security.
--
-- Auth model: the tablet signs in as ONE Supabase account (the shop device).
-- Barbers do not have Supabase accounts — they are identified per transaction
-- by PIN (hard design rule #2). So `authenticated` here means "the shop
-- device", and the owner reads reports out of band (email) or via the
-- service role.

alter table barbers enable row level security;
alter table services enable row level security;
alter table transactions enable row level security;
alter table momo_payments enable row level security;
alter table cash_counts enable row level security;
alter table device_heartbeats enable row level security;
alter table reconciliation_reports enable row level security;
alter table transaction_matches enable row level security;
alter table shop_settings enable row level security;

-- The device reads the barber and service lists to work offline, and reads
-- back its own transactions. It can never modify either catalogue.
create policy device_reads_barbers on barbers
  for select to authenticated using (true);

create policy device_reads_services on services
  for select to authenticated using (true);

-- Transactions: insert-only for the device. UPDATE/DELETE are already
-- revoked and trigger-blocked in 0002; no policy for them exists here either.
create policy device_inserts_transactions on transactions
  for insert to authenticated with check (true);

create policy device_reads_transactions on transactions
  for select to authenticated using (true);

-- Cash counts: the manager enters them, they are not revisable by the device.
create policy device_inserts_cash_counts on cash_counts
  for insert to authenticated with check (true);

create policy device_reads_cash_counts on cash_counts
  for select to authenticated using (true);

-- Heartbeats: the device reports its own liveness and nothing else.
create policy device_upserts_own_heartbeat on device_heartbeats
  for insert to authenticated with check (true);

create policy device_updates_own_heartbeat on device_heartbeats
  for update to authenticated using (true) with check (true);

create policy device_reads_heartbeats on device_heartbeats
  for select to authenticated using (true);

-- The device reads settings (opening float, business hours) to render the
-- cash count screen. It cannot change thresholds.
create policy device_reads_settings on shop_settings
  for select to authenticated using (true);

-- momo_payments, transaction_matches and reconciliation_reports are written
-- exclusively by edge functions running as the service role, which bypasses
-- RLS. Deliberately no `authenticated` policies: the tablet has no business
-- reading or writing MoMo data or reconciliation output — that would let
-- whoever holds the device see exactly which checks are about to fire.
