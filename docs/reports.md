# Reading the records

The daily email tells you about one day. This is how to ask about a month, a
quarter, or the whole year.

For month-by-month takings you no longer need any of this — the **History**
tab in the app does it, behind the owner's PIN (`docs/history.md`). What
follows is for everything that screen does not answer: revenue by service,
cash variance over time, CSV exports, arbitrary date ranges.

Everything here runs in the Supabase dashboard: **SQL Editor → new query →
Run**. Nothing needs a terminal. Each query has an **Export** button above the
results for CSV, and the **Save** button keeps it in the left-hand list so next
month is one click.

## A note on the dates

Group on `created_at_local` — the moment the sale was rung up on the tablet —
not `synced_at`, which is when the server received it. For a tablet that was
offline they are different days, and the first one is the one the shop had.

`at time zone 'Africa/Accra'` appears throughout so the answer is the same
whether you run it from Kumasi or from the UK. Without it the day boundary
follows whatever timezone your session happens to be in, which in British
summer time quietly moves an hour of takings into the previous day.

## A note on voids

A void is not a deletion — nothing in `transactions` can be deleted. It is a
second row carrying the negative of the original, so `sum(amount)` nets out on
its own and both rows stay visible. That is why the queries below sum plainly
and count with a `filter` rather than trying to exclude anything.

---

## Last calendar month, in one line

```sql
select count(*) filter (where corrects_transaction_id is null)     as sales,
       count(*) filter (where corrects_transaction_id is not null) as voids,
       sum(amount)                                                 as revenue_ghs
from transactions
where (created_at_local at time zone 'Africa/Accra') >= date_trunc('month', current_date) - interval '1 month'
  and (created_at_local at time zone 'Africa/Accra') <  date_trunc('month', current_date);
```

## Every month so far

The one to save. Run it any time for the whole trading history.

```sql
select to_char(date_trunc('month', created_at_local at time zone 'Africa/Accra'), 'Mon YYYY') as month,
       count(*) filter (where corrects_transaction_id is null) as sales,
       sum(amount) as revenue_ghs
from transactions
group by date_trunc('month', created_at_local at time zone 'Africa/Accra')
order by date_trunc('month', created_at_local at time zone 'Africa/Accra') desc;
```

## Day by day through last month

```sql
select (created_at_local at time zone 'Africa/Accra')::date as day,
       count(*) filter (where corrects_transaction_id is null) as sales,
       sum(amount) as revenue_ghs
from transactions
where (created_at_local at time zone 'Africa/Accra') >= date_trunc('month', current_date) - interval '1 month'
  and (created_at_local at time zone 'Africa/Accra') <  date_trunc('month', current_date)
group by 1
order by 1;
```

A day missing from these results is a day with no sales logged at all — worth
a question on its own, because a closed shop and a tablet nobody used look the
same here. `device_heartbeats` is what separates them.

## Which services earn the money

```sql
select s.name,
       count(*) as sold,
       sum(t.amount) as ghs
from transactions t
join services s on s.id = t.service_id
where (t.created_at_local at time zone 'Africa/Accra') >= date_trunc('month', current_date) - interval '1 month'
  and (t.created_at_local at time zone 'Africa/Accra') <  date_trunc('month', current_date)
group by s.name
order by ghs desc;
```

Swap `services` for `barbers` and `service_id` for `barber_id` to get the same
answer per barber, once there is more than one.

## What the nightly job concluded

`reconciliation_reports` already holds one row per day, written at 21:30, with
the full structured report in `report`. This is the cheapest history to query
because the work is already done.

```sql
select business_date, revenue_total, txn_count, severity
from reconciliation_reports
where business_date >= (date_trunc('month', current_date) - interval '1 month')::date
  and business_date <  date_trunc('month', current_date)::date
order by business_date desc;
```

And the month at a glance — how many nights were clean:

```sql
select severity, count(*) as nights
from reconciliation_reports
where business_date >= (date_trunc('month', current_date) - interval '1 month')::date
  and business_date <  date_trunc('month', current_date)::date
group by severity
order by severity;
```

## Cash: counted against expected

The number that matters over a month is not any single night's variance but
whether it drifts one way. Consistent shorts are a different problem from
noise around zero.

```sql
select count(*)    as counts_done,
       sum(variance) as total_variance_ghs,
       min(variance) as worst_short,
       max(variance) as worst_over
from cash_counts
where shift_date >= (date_trunc('month', current_date) - interval '1 month')::date
  and shift_date <  date_trunc('month', current_date)::date;
```

`counts_done` below the number of trading days is itself the finding: a night
that was never counted cannot be reconciled, and the nightly job flags it
MEDIUM at the time.

---

## Will the database fill up?

No. Measured on this exact schema, with a full year of trading at 30 sales a
day loaded in and every index built:

| | |
|---|---|
| One sale, including its five indexes | **257 bytes** |
| `transactions` after one year (10,950 sales) | **2.75 MB** |
| Every table together, one full year | **3.3 MB** |

The free plan allows 500 MB. The ~27 MB a fresh project already reports is
Postgres' own catalogues and extensions — the floor, before any of the shop's
data. That leaves room for well over a century of trading, and roughly forty
years even at 100 sales a day.

Storage is not the limit worth watching. The one to know about is that a free
Supabase project **pauses after about a week with no activity** — which cannot
happen here while the tablet is syncing every couple of minutes and the cron
job runs every night. If the shop ever closes for a fortnight, check the
project is still awake before reopening.
