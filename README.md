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

## Running it locally

```bash
npm install
cp .env.example .env.local      # fill in VITE_SUPABASE_URL and the anon key
npm run dev
```

```bash
npm test        # reconciliation logic — 31 tests, no backend needed
npm run lint    # typecheck
npm run build   # production PWA bundle + service worker
```

The reconciliation logic is pure and has no Supabase or Deno dependencies, so
the checks can be developed and tested without a backend at all.

## Deploying

```bash
supabase link --project-ref <ref>
supabase db push                              # migrations 0001–0005
supabase db execute --file supabase/seed.sql  # dev/demo data only

supabase secrets set \
  MOMO_BASE_URL=... MOMO_SUBSCRIPTION_KEY=... MOMO_API_USER=... MOMO_API_KEY=... \
  RESEND_API_KEY=... REPORT_FROM_EMAIL=... \
  TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_WHATSAPP_FROM=...

supabase functions deploy momo-sync
supabase functions deploy nightly-reconciliation
```

Migration 0005 schedules both jobs with pg_cron. Before it runs, set the two
database settings it reads:

```sql
alter database postgres set app.settings.project_url = 'https://<ref>.supabase.co';
alter database postgres set app.settings.service_role_key = '<service-role-key>';
```

Then set the owner's contact details and any threshold you want to tune:

```sql
update shop_settings set owner_email = '...', owner_whatsapp = '+44...';
```

Add real barbers with `npm run hash-pin -- 4821`, which prints the
`pin_hash`/`pin_salt`/`pin_iterations` to insert. Never store a raw PIN.

### Tablet setup

Serve the built app over HTTPS and add it to the home screen — it installs as a
standalone PWA. Provision the device once with `VITE_DEVICE_EMAIL` /
`VITE_DEVICE_PASSWORD` (a single Supabase account representing the shop
device), and let it sync once while online so the barber and service lists are
cached. After that it works with no connection.

## The nightly job

Runs at 21:30 local, 90 minutes after close. It cross-checks three sources that
do not depend on each other:

- **Check A — digital declared vs digital received.** The strongest check: MoMo
  data comes from MTN, not from staff. Each MoMo payment is matched to a digital
  sale on exact amount within a 15-minute window; where several sales qualify,
  the closest in time wins. Unmatched in either direction is HIGH.
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

Re-run a missed night by hand:

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
