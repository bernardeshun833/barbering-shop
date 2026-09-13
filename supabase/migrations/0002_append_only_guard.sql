-- Hard design rule #1: transactions is append-only. No UPDATE, no DELETE —
-- ever, for anyone, including the service role. Corrections are new rows
-- referencing corrects_transaction_id (added in 0001).
--
-- Enforced two ways, deliberately redundant:
--   1. A trigger that raises on any UPDATE/DELETE attempt, so the failure
--      message is explicit and actionable instead of a bare permission error.
--   2. Table privileges are revoked for every role so the statement is
--      rejected before the trigger even runs, for any role that isn't the
--      table owner (which Postgres/Supabase cannot restrict — the trigger
--      is what covers that gap).
--
-- This must hold even for the `postgres`/service_role connection the sync
-- engine and edge functions use — don't grant an "admin bypass" here.

create or replace function reject_transaction_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'transactions is append-only: % is not permitted. Insert a correction row referencing corrects_transaction_id instead.', TG_OP
    using errcode = '42501';
  return null;
end;
$$;

create trigger transactions_no_update
  before update on transactions
  for each row execute function reject_transaction_mutation();

create trigger transactions_no_delete
  before delete on transactions
  for each row execute function reject_transaction_mutation();

-- The reconciliation job needs somewhere to record that a transaction was
-- matched to a MoMo payment (Check A). That state deliberately does NOT live
-- as a column on transactions — a `matched` flag would require an UPDATE and
-- force an exception into the trigger above, weakening the guarantee for
-- every other caller. It lives in its own table instead, so `transactions`
-- truly never receives an UPDATE from any role.
create table transaction_matches (
  transaction_id uuid primary key references transactions(id),
  momo_payment_id uuid not null references momo_payments(id),
  matched_at timestamptz not null default now()
);

revoke update, delete on transactions from public, authenticated, anon, service_role;
grant select, insert on transactions to authenticated, service_role;
grant select on transactions to anon;
