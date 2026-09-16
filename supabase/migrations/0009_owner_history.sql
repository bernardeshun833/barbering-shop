-- Owner-only history.
--
-- The manager runs the till; the owner reads the record. Those are different
-- people with different interests, which is the premise this whole system is
-- built on — so "show me every sale this month" is not something the shift PIN
-- should open. Someone deciding whether to under-ring tonight should not be
-- able to study which nights were flagged and which slipped through.
--
-- Three things have to be true for that to mean anything:
--
--   1. The owner's PIN is checked IN THE DATABASE, never on the device. A
--      hash that syncs to the tablet is a hash that can be brute-forced off
--      the tablet — 10^6 candidates is minutes of work for whoever holds it.
--      So owner_credentials has RLS on and NO POLICY AT ALL: not even the
--      shop device can read a row from it. Only the definer functions below
--      can, and they return a boolean, never the hash.
--
--   2. The history itself is unreadable without that PIN. Hiding a tab is
--      theatre while the row-level policy still says "the device may select
--      every transaction ever" — devtools is one tap away on any browser.
--      So the device's read is narrowed to the last two days, and history is
--      reachable only through the definer functions.
--
--   3. The tablet stops hoarding it locally. See pruneSyncedHistory in
--      src/lib/db.ts: once a row is safely on the server it is dropped from
--      IndexedDB after two days, so there is no local copy to read either.
--
-- Rate limiting is what makes a short PIN survivable: the RPC is reachable by
-- anyone holding the anon key, so ten wrong PINs locks it for fifteen minutes. That does mean
-- someone on the shop floor could lock the owner out for a quarter of an hour
-- by guessing badly on purpose. Fifteen minutes of nuisance is the right
-- trade against an unlimited guessing budget.

create table owner_credentials (
  id boolean primary key default true check (id),   -- one row, like shop_settings
  pin_hash text not null,                           -- bcrypt, via pgcrypto's crypt()
  updated_at timestamptz not null default now()
);

alter table owner_credentials enable row level security;
-- Intentionally no policies. RLS with no policy denies everything to every
-- role that is not the table owner, which is exactly what is wanted here.

create table owner_pin_attempts (
  id boolean primary key default true check (id),
  failures integer not null default 0,
  locked_until timestamptz
);

alter table owner_pin_attempts enable row level security;
-- Same: no policies. The device must not be able to read the failure count
-- (it tells an attacker how much budget is left) or reset it.

insert into owner_pin_attempts (id) values (true);

-- Set or change the owner PIN. Run it yourself in the SQL editor:
--
--   select set_owner_pin('<your PIN>');
--
-- then clear the editor — the statement stays in your query history otherwise.
create or replace function set_owner_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- Four is enough because this is checked here, in the database, behind the
  -- lockout below. Ten thousand candidates at ten tries per fifteen minutes is
  -- upwards of a week of continuous guessing. The same PIN verified on the
  -- device, against a hash that syncs to it, would fall in minutes — which is
  -- the whole reason this function exists rather than a column on barbers.
  if length(p_pin) < 4 then
    raise exception 'The owner PIN must be at least 4 digits';
  end if;

  insert into owner_credentials (id, pin_hash, updated_at)
  values (true, crypt(p_pin, gen_salt('bf', 12)), now())
  on conflict (id) do update
    set pin_hash = excluded.pin_hash, updated_at = now();

  update owner_pin_attempts set failures = 0, locked_until = null where id;
end;
$$;

-- Deliberately NOT granted to the app. Changing the owner's PIN is a
-- dashboard job, not something reachable with the key in the tablet.
revoke all on function set_owner_pin(text) from public, anon, authenticated;

/**
 * True when the PIN is right. Counts failures, and refuses outright while
 * locked out. Raises rather than returning false for the lockout, so the app
 * can tell "wrong PIN" from "stop trying" and say so.
 */
create or replace function owner_pin_ok(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash     text;
  v_locked   timestamptz;
  v_failures integer;
begin
  select locked_until, failures into v_locked, v_failures
  from owner_pin_attempts where id;

  if v_locked is not null and v_locked > now() then
    raise exception 'LOCKED_UNTIL %', to_char(v_locked at time zone 'Africa/Accra', 'HH24:MI');
  end if;

  select pin_hash into v_hash from owner_credentials where id;
  if v_hash is null then
    raise exception 'NO_OWNER_PIN';
  end if;

  if crypt(p_pin, v_hash) = v_hash then
    update owner_pin_attempts set failures = 0, locked_until = null where id;
    return true;
  end if;

  v_failures := coalesce(v_failures, 0) + 1;
  update owner_pin_attempts
     set failures = v_failures,
         locked_until = case when v_failures >= 10 then now() + interval '15 minutes' end
   where id;

  return false;
end;
$$;

revoke all on function owner_pin_ok(text) from public, anon;
grant execute on function owner_pin_ok(text) to authenticated;

/**
 * One row per trading day. Grouped on created_at_local — the moment the sale
 * was rung up on the tablet — in the shop's own timezone, so a sale that
 * reached the server two days late still counts on the day it happened.
 *
 * severity is the nightly job's verdict for that day, or null on a day it has
 * not reported yet.
 */
create or replace function owner_daily_totals(p_pin text, p_from date, p_to date)
returns table (
  day      date,
  sales    integer,
  voids    integer,
  revenue  numeric,
  severity text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not owner_pin_ok(p_pin) then
    raise exception 'WRONG_PIN';
  end if;

  return query
  with tz as (select shop_settings.timezone as name from shop_settings where id),
  days as (
    select (t.created_at_local at time zone tz.name)::date                    as day,
           count(*) filter (where t.corrects_transaction_id is null)::integer as sales,
           count(*) filter (where t.corrects_transaction_id is not null)::integer as voids,
           sum(t.amount)                                                      as revenue
    from transactions t cross join tz
    where (t.created_at_local at time zone tz.name)::date between p_from and p_to
    group by 1
  )
  select d.day, d.sales, d.voids, d.revenue, r.severity
  from days d
  left join reconciliation_reports r on r.business_date = d.day
  order by d.day desc;
end;
$$;

revoke all on function owner_daily_totals(text, date, date) from public, anon;
grant execute on function owner_daily_totals(text, date, date) to authenticated;

/** Every sale on one day, for when a day's total raises a question. */
create or replace function owner_day_sales(p_pin text, p_day date)
returns table (
  at            timestamptz,
  service       text,
  barber        text,
  amount        numeric,
  method        text,
  is_correction boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not owner_pin_ok(p_pin) then
    raise exception 'WRONG_PIN';
  end if;

  return query
  with tz as (select shop_settings.timezone as name from shop_settings where id)
  select t.created_at_local,
         s.name,
         b.name,
         t.amount,
         t.payment_method,
         t.corrects_transaction_id is not null
  from transactions t
  cross join tz
  join services s on s.id = t.service_id
  join barbers  b on b.id = t.barber_id
  where (t.created_at_local at time zone tz.name)::date = p_day
  order by t.created_at_local;
end;
$$;

revoke all on function owner_day_sales(text, date) from public, anon;
grant execute on function owner_day_sales(text, date) to authenticated;

-- The device's own read of transactions narrows to the last two days: enough
-- for the Today screen and for a void, and nothing beyond it. Without this the
-- functions above are a locked door in an open wall.
drop policy if exists device_reads_transactions on transactions;

create policy device_reads_recent_transactions on transactions
  for select to authenticated
  using (created_at_local >= (now() - interval '2 days'));
