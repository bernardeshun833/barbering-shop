# Kumasi Barbershop POS + Reconciliation

Offline-first point of sale for a single-location barbershop, plus a nightly job
that cross-checks what was logged against what actually arrived.

The shop is in Kumasi; the owner is in the UK. The manager logs every sale on a
tablet with unreliable connectivity. The system's job is to give the owner
honest daily visibility into cash and digital payments without being there.

## How it fits together

```
Tablet (React PWA)                 Supabase                    Owner
┌────────────────────┐      ┌──────────────────────┐      ┌──────────┐
│ PIN → sale entry   │      │ transactions         │      │ Email    │
│        ↓           │ push │  (append-only)       │      │ every    │
│ IndexedDB queue    │─────▶│ cash_counts          │      │ day      │
│  (durable first)   │ ~2m  │ momo_payments ◀──────┼─ MTN │          │
│        ↓           │      │ device_heartbeats    │ MoMo │ WhatsApp │
│ sync engine        │      │        ↓             │      │ on       │
└────────────────────┘      │ nightly job 21:30 ───┼─────▶│ MEDIUM+  │
                            └──────────────────────┘      └──────────┘
```

A sale is durable in IndexedDB the moment the PIN is accepted — before anything
touches the network. The sync engine drains the queue every couple of minutes
and on every reconnect, so the window of data that exists only on the tablet
stays small. That window is what is lost if the tablet is dropped, stolen, or
reset, which is why it is shown on screen as a live count rather than hidden
behind a spinner.

## The five hard rules, and where they live

| Rule | Where it is enforced |
|---|---|
| Append-only transactions | `supabase/migrations/0002` — trigger rejecting UPDATE/DELETE + revoked grants. Not the frontend. |
| PIN-gated entry | `src/pages/TransactionEntry.tsx` — no row is queued until `verifyPin` passes |
| Two timestamps | `created_at_local` set on-device, `synced_at` defaulted server-side on insert |
| Offline-first sync | `src/lib/sync.ts` — 2 minute interval, immediate on reconnect and on foreground |
| Device silence is a signal | `computeDeviceGaps` in `supabase/functions/_shared/reconciliation.ts` |

Read `docs/security.md` for what these actually guarantee — and what they don't.

## Cash-only mode

`shop_settings.momo_enabled` defaults to **false**, so the shop can run before
mobile money is live and switch it on later with one flag:

- the tablet offers cash only and **skips the payment step entirely** — a screen
  that asks "how did they pay?" with one possible answer teaches the manager to
  tap without reading. It defaults to cash-only until settings have synced, so a
  fresh tablet cannot offer a method the shop cannot reconcile;
- Check A is **skipped, not passed**. The report says "cash only — not checked"
  rather than showing a variance against a feed that does not exist;
- if a digital sale is logged anyway, or MoMo money arrives from a feed nobody
  configured, that is one MEDIUM flag saying the settings no longer describe the
  business — one flag, not one per row.

Nothing MoMo-related runs while the shop is cash-only: the `momo-sync` cron job
is deliberately not scheduled (migration `0007`), so there is no point polling
an API the business has no credentials for. Only `nightly-reconciliation` is
scheduled, and it runs fine with no MoMo data — it is what emails the owner
every day and builds the baseline the volume checks need.

### Switching MoMo on later

Three steps, no rebuild and nothing to reinstall on the tablet:

```sql
-- 1. Flip the flag. The tablet picks it up on its next sync.
update shop_settings set momo_enabled = true;
```

```bash
# 2. Set the credentials and deploy the function.
supabase secrets set MOMO_BASE_URL=... MOMO_SUBSCRIPTION_KEY=... \
                     MOMO_API_USER=... MOMO_API_KEY=... MOMO_TARGET_ENVIRONMENT=...
supabase functions deploy momo-sync
```

```sql
-- 3. Start polling. The exact statement is in migration 0007.
select cron.schedule('momo-sync', '*/15 * * * *', $job$ ... $job$);
```

Do step 3 **before** step 1 if you can: with the flag on and no MoMo data
flowing, every digital sale reconciles against an empty feed and the report
fills with HIGH flags for money that did in fact arrive.

`tests/cash-only.test.ts` covers the switch in both positions.

## Reading the records

The **History** tab shows previous months in the app, behind the owner's own
PIN — not the shift PIN. `docs/history.md` covers turning it on and, more to
the point, what makes the lock real rather than cosmetic: the PIN is verified
in the database (migration 0009), the device's read of `transactions` is
narrowed to two days, and the tablet prunes its local copy so devtools cannot
read the record out of IndexedDB.

The daily email covers one day. `docs/reports.md` has the queries for a month,
a quarter or the year — revenue by month, by day, by service, cash variance
over time, and what the nightly job concluded — all runnable in the Supabase
SQL editor with no terminal. It also has the measured storage figures: a full
year of trading at 30 sales a day is 3.3 MB against a 500 MB free plan.

## Testing it without a dev environment

`docs/testing.md` is a runbook for verifying the whole system with nothing but
a laptop, a phone and GitHub — no Docker and no Supabase CLI. Migrations go in
through the dashboard SQL editor, the PWA deploys to Cloudflare (see
`wrangler.toml`) or GitHub Pages so it can be installed on a real phone, and
the nightly job is deployed and triggered from the Actions tab.

With no Supabase URL and anon key configured, the app runs as a **demo**:
built-in barbers and services, sales kept in the browser, nothing sent
anywhere, and an orange banner on every screen saying so. That makes the tablet
experience testable on a real phone before a backend exists. Setting the two
variables — they are baked in at build time, so they belong in the host's build
environment — turns the demo off.

## Running it locally

```bash
npm install
cp .env.example .env.local      # fill in VITE_SUPABASE_URL and the anon key
npm run dev
```

```bash
npm test        # reconciliation logic and sync shaping — 60 tests, no backend needed
npm run lint    # typecheck
npm run build   # production PWA bundle + service worker
```

The reconciliation logic is pure and has no Supabase or Deno dependencies, so
the checks can be developed and tested without a backend at all.

## Deploying

```bash
supabase link --project-ref <ref>
supabase db push                              # migrations 0001–0009
supabase db execute --file supabase/seed.sql  # dev/demo data only

# MoMo secrets are not needed while the shop is cash-only — see above.
supabase secrets set \
  RESEND_API_KEY=... REPORT_FROM_EMAIL=... \
  TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_WHATSAPP_FROM=...

supabase functions deploy nightly-reconciliation
```

Migration 0005 schedules the cron jobs with pg_cron, 0007 unschedules
`momo-sync` again, and 0008 points the nightly job at Vault for its URL and
key. Create those two secrets once — hosted Supabase does not allow the
`alter database ... set` that 0005 originally assumed, so Vault is where these
live:

```sql
select vault.create_secret('https://<ref>.supabase.co', 'project_url');
select vault.create_secret('<service-role-key>', 'service_role_key');
```

Then set the owner's contact details and any threshold you want to tune:

```sql
update shop_settings set owner_email = '...', owner_whatsapp = '+44...';
```

`supabase/seed.sql` sets up Ohemaa Effe and the service list, and is safe to
run repeatedly: it upserts her, retires every other barber, and refreshes the
services. Retires rather than deletes — `transactions.barber_id` points at
those rows and that table is append-only.

Add real barbers with `npm run hash-pin -- 4821`, which prints the
`pin_hash`/`pin_salt`/`pin_iterations` to insert. Never store a raw PIN. Note
that a second active barber changes the tablet's behaviour: the start-of-shift
PIN unlock becomes a PIN on every sale, because that is the point at which
"who did this cut?" is a question worth asking.

### Tablet setup

Serve the built app over HTTPS and add it to the home screen — it installs as a
standalone PWA. On first open it asks to be provisioned: enter the shop
device's Supabase account (**Authentication → Users**) on the "Set up this
tablet" screen. Supabase persists and refreshes that session, so it is asked
once per tablet and never again unless the browser's site data is cleared.

Those credentials are deliberately **not** build variables. A `VITE_` value is
compiled into the bundle, and an authenticated session in the bundle is one
anybody can take — enough to read the barbers' PIN hashes and to insert sales
that never happened into a table that cannot forget them. See
`docs/security.md`.

Let it sync once while online so the barber and service lists are cached.
After that it works with no connection.

## The nightly job

Runs at 21:30 local, 90 minutes after close. It cross-checks three sources that
do not depend on each other:

- **Check A — digital declared vs digital received.** The strongest check: MoMo
  data comes from MTN, not from staff. Each MoMo payment is matched to a digital
  sale on exact amount within a 15-minute window; where several sales qualify,
  the closest in time wins. Unmatched in either direction is HIGH.
  *Skipped while `momo_enabled` is false — see Cash-only mode above.*
- **Check B — cash declared vs cash counted.** `expected_cash` is recomputed
  server-side from POS rows, so the figure shown on the tablet cannot influence
  it. Over the threshold is MEDIUM; a missing count is also MEDIUM.
- **Check C — volume sanity.** Rolling median of the same weekday over 8 weeks,
  and per-barber over 30 days. This is the only counter-check for an unlogged
  cash sale, which by definition leaves no other trace. Skipped entirely until
  there is history — a median over an empty window is worse than no check.
- **Check D — behavioural.** Cash-share spike, after-hours entries, extended
  offline periods. All LOW: prompts to ask a question, not findings.

Severity is the max across all checks. The report is emailed **every day, clean
or not** — a report that only arrives when something is wrong teaches the reader
that silence means fine, and silence is exactly what a dead tablet produces.
WhatsApp fires only at MEDIUM or above.

Every report is stored, which is what builds the baseline the rolling medians
depend on.

### Late data revises the day it belongs to

A tablet that is offline past 21:30 — the exact case offline-first exists for —
pushes its sales the next morning, still carrying the previous day's
`created_at_local`. So before reporting today, the job looks back 14 days for
any date whose sales reached the server *after* that date's report was written,
or that has sales and no report at all, and reconciles those days again, oldest
first.

Without this, a day reported while the tablet was offline stayed wrong forever
— and because stored reports are the baseline, the wrong number would teach the
volume checks the wrong normal.

Corrections are not silent: when an earlier day's figures move, today's email
carries a short "Revised earlier days" table showing what the owner was told
against what the day actually was. It stays in the one daily email — a
corrected Tuesday is not worth its own alert.

A manual `?date=` run reconciles only that day and skips the look-back, so
re-running one night by hand cannot quietly rewrite a fortnight of history:

```bash
curl -X POST "https://<ref>.supabase.co/functions/v1/nightly-reconciliation?date=2026-03-12" \
  -H "Authorization: Bearer <service-role-key>"
```

## MoMo status

Token acquisition is the documented flow and works against sandbox now. The
statement endpoint is configurable (`MOMO_STATEMENT_PATH`) because which
endpoint returns "payments received on date X" depends on the product the
business is approved for, and production access needs a registered business and
KYC that can take weeks. Until that lands, point `MOMO_BASE_URL` at the sandbox
— matching, variance and reporting all run end to end on sandbox data.

## Out of scope

CCTV, cash safe and till hardware (source locally); the written cash-handling
SOP (a procedure, not a feature); and anything addressing manager–barber
collusion or manager competence, which software does not solve.
