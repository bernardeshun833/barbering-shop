# Testing it with a laptop, a phone and GitHub

No Docker, no Supabase CLI, no terminal beyond `npm` on the laptop. Everything
else happens in a browser or in the GitHub Actions tab — which works from a
phone.

Work through it in order; each part stands on its own, so you can stop after
part 1 and still have learned something real.

---

## 1. The logic — laptop, two minutes

```bash
npm install
npm test
```

57 tests. They cover the reconciliation maths, the cash-only switch, the daily
email, and the late-sync fix — all without a backend, because that logic is
written as pure functions on purpose.

This is also running on every push: **Actions → CI**. If that tick is green,
the logic is sound. It says nothing about whether your Supabase project is
wired up correctly, which is what the rest of this is for.

To see the tablet itself:

```bash
npm run dev
```

Open it, log a sale (dev PINs are Kwame `1234`, Ama `2345`, Yaw `3456`), then
open devtools → Network → **Offline** and log a few more. The top bar counts
what is waiting. Go back online and watch it drain. That is the offline
guarantee, demonstrated.

---

## 2. A real backend — browser only, about fifteen minutes

1. Sign up at supabase.com and create a free project. Note the **project ref**
   (the code in your project URL).
2. In the dashboard, open **SQL Editor**. Open each file in
   `supabase/migrations/` in order — `0001` through `0007` — and paste and run
   them one at a time. This replaces `supabase db push`.
3. Optionally paste `supabase/seed.sql` for demo barbers and services.
4. **Project Settings → API** gives you the project URL, the `anon` key and the
   `service_role` key. The service role key bypasses every security rule —
   treat it like a password, and never put it in the tablet app.

Then set the database settings the cron jobs read, in the SQL editor:

```sql
alter database postgres set app.settings.project_url = 'https://<ref>.supabase.co';
alter database postgres set app.settings.service_role_key = '<service-role-key>';

update shop_settings set owner_email = 'you@example.com';
```

---

## 3. Put it on your phone — GitHub Actions

Add these under **Settings → Secrets and variables → Actions**:

| Secret | Where it comes from |
| --- | --- |
| `VITE_SUPABASE_URL` | Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Project Settings → API (the `anon` key) |
| `SUPABASE_PROJECT_REF` | the code in your project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API (`service_role`) |
| `SUPABASE_ACCESS_TOKEN` | Account → Access Tokens |

Then **Settings → Pages → Source: GitHub Actions**, and run
**Actions → Deploy tablet app**. It publishes to
`https://<your-username>.github.io/barbering-shop/`.

Open that on the phone and use **Add to Home Screen**. It installs as a proper
app: full screen, works offline, survives being closed. Put the phone in
aeroplane mode, log sales, turn it back on — the queue drains. That is the same
code that will run on the tablet.

> The app signs in as the shop device. Create that account in the Supabase
> dashboard (**Authentication → Users → Add user**), then add
> `VITE_DEVICE_EMAIL` and `VITE_DEVICE_PASSWORD` as secrets and redeploy.

---

## 4. The nightly job — no terminal

Run **Actions → Deploy edge functions** once. After that,
**Actions → Run nightly reconciliation** runs the job on demand and prints the
result in the log. Leave the date blank for today.

Don't open the function URL in a browser: it requires a valid key, which the
workflow supplies from secrets. That is deliberate — an open URL would let
anyone trigger the owner's email.

### Proving the late-sync fix

The fix makes the job go back and re-reconcile a day whose sales arrived after
that day's report was written. To stage that, use the fact that `synced_at`
defaults to the moment of insert: a row *dated* yesterday but *inserted* now is
exactly a tablet that was offline.

In the SQL editor:

```sql
-- One sale yesterday afternoon.
insert into transactions (barber_id, service_id, amount, payment_method, created_at_local, device_id)
select b.id, s.id, 40, 'cash', (current_date - 1) + time '14:00', 'tablet-1'
from barbers b, services s limit 1;
```

Run **Run nightly reconciliation** with the date set to yesterday
(`YYYY-MM-DD`). That writes yesterday's report. Check it:

```sql
select business_date, revenue_total, txn_count from reconciliation_reports;
```

Now add two more sales for yesterday — the ones that "arrive late":

```sql
insert into transactions (barber_id, service_id, amount, payment_method, created_at_local, device_id)
select b.id, s.id, 60, 'cash', (current_date - 1) + time '16:00', 'tablet-1'
from barbers b, services s limit 1;

insert into transactions (barber_id, service_id, amount, payment_method, created_at_local, device_id)
select b.id, s.id, 40, 'cash', (current_date - 1) + time '17:30', 'tablet-1'
from barbers b, services s limit 1;
```

Run the workflow again, this time **leaving the date blank**.

**What proves it worked:** the log shows a notice reading
`Revised earlier days: ["<yesterday>"]`, and re-running the query above shows
yesterday's `revenue_total` risen from 40 to 140 and `txn_count` from 1 to 3.

Before this fix, `revised` would always have been empty and yesterday would
have stayed at 40 forever — while quietly serving as the baseline that teaches
the volume checks what a normal day looks like.

---

## What none of this covers

Emails only send once `RESEND_API_KEY` and `REPORT_FROM_EMAIL` are set; until
then the workflow output reports `skipped` for delivery, which is the honest
answer rather than a silent success. The same goes for WhatsApp and Twilio.

And no amount of this tells you whether the manager finds the tablet easy to
use at 6pm with three people waiting. That needs a real person and a real
shift.
