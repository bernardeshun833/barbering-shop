-- Make the owner's history queries use the index that already exists.
--
-- 0009 filtered on `(created_at_local at time zone tz)::date between ...`.
-- That is correct but not sargable: the expression has to be evaluated for
-- every row before it can be compared, so `transactions_created_at_local_idx`
-- sat unused and each query read the whole table.
--
-- The same window expressed as a half-open range on the bare column is an
-- index scan. The conversion moves to the bounds — computed once — rather than
-- onto every row:
--
--   created_at_local >= p_from 00:00 in the shop's timezone
--   created_at_local <  the day after p_to, 00:00 in the shop's timezone
--
-- Half-open on purpose. `between` on a date would silently exclude everything
-- after midnight on the last day, which is most of it.
--
-- At a few thousand rows a year this changes nothing anyone can feel. It
-- matters because the table only grows, and a full scan behind a PIN check is
-- exactly the sort of thing nobody revisits until it is slow.

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
declare
  v_tz    text;
  v_start timestamptz;
  v_end   timestamptz;
begin
  if not owner_pin_ok(p_pin) then
    raise exception 'WRONG_PIN';
  end if;

  select shop_settings.timezone into v_tz from shop_settings where id;
  v_start := p_from::timestamp at time zone v_tz;
  v_end   := (p_to + 1)::timestamp at time zone v_tz;

  return query
  with days as (
    select (t.created_at_local at time zone v_tz)::date                        as day,
           count(*) filter (where t.corrects_transaction_id is null)::integer  as sales,
           count(*) filter (where t.corrects_transaction_id is not null)::integer as voids,
           sum(t.amount)                                                       as revenue
    from transactions t
    where t.created_at_local >= v_start
      and t.created_at_local <  v_end
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
declare
  v_tz    text;
  v_start timestamptz;
  v_end   timestamptz;
begin
  if not owner_pin_ok(p_pin) then
    raise exception 'WRONG_PIN';
  end if;

  select shop_settings.timezone into v_tz from shop_settings where id;
  v_start := p_day::timestamp at time zone v_tz;
  v_end   := (p_day + 1)::timestamp at time zone v_tz;

  return query
  select t.created_at_local,
         s.name,
         b.name,
         t.amount,
         t.payment_method,
         t.corrects_transaction_id is not null
  from transactions t
  join services s on s.id = t.service_id
  join barbers  b on b.id = t.barber_id
  where t.created_at_local >= v_start
    and t.created_at_local <  v_end
  order by t.created_at_local;
end;
$$;

revoke all on function owner_day_sales(text, date) from public, anon;
grant execute on function owner_day_sales(text, date) to authenticated;
