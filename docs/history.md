# The History tab

Previous sales, in the app, on your phone — a month at a time, tap a day to
see what it was made of. Behind your own PIN, not the shift PIN.

## Turning it on

**1. Apply the migration.** Supabase dashboard → **SQL Editor** → paste
`supabase/migrations/0009_owner_history.sql` → **Run**.

**2. Set your PIN.** In the same editor:

```sql
select set_owner_pin('<your PIN>');
```

Then clear the editor and do not save that query — the SQL editor keeps a
history, and a saved snippet containing your PIN defeats the point.

Change it any time by running it again. Nothing else needs updating: only the
hash is stored, and only the database ever sees it.

**3. Redeploy the app** so the tab appears, and open `/history`.

## What it shows

- **The month's takings**, and how many sales over how many trading days.
- **Each day**: sales, voids, and what it came to. Tap for the individual
  sales with times, service and payment method.
- **The nightly job's verdict**, but only when it found something. A green
  tick on every clean day trains the eye to skip the row, which is exactly
  where the flagged ones live.

A day is the day the sale was *rung up on the tablet*, not the day the server
received it. A sale that synced two days late still counts on the day it
happened. See "Late data revises the day it belongs to" in the README.

## Why it is a separate PIN, and what that actually buys

The person running the till and the person checking the till are different
people with different interests. Someone weighing up whether to under-ring
tonight should not be able to study which nights the reconciliation flagged
and which ones slipped through.

Hiding a tab would not achieve that. Three things make the lock real:

**The PIN is checked in the database, never on the tablet.** `barbers.pin_hash`
syncs down to the device on purpose, because a shift PIN has to work with no
signal. A hash on the device is a hash that can be brute-forced off the device
— ten thousand candidates is minutes of work for whoever is holding it. So the
owner's hash lives in `owner_credentials`, which has row-level security on and
**no policy at all**: not even the shop device can read a row from it. Only the
`security definer` functions can, and they return a boolean, never the hash.

**The history is unreadable without that PIN.** The device's own read of
`transactions` is narrowed to the last two days — enough for the Today screen
and for a void, and nothing beyond. History is reachable only through
`owner_daily_totals` and `owner_day_sales`, which check the PIN before they
return a row.

**The tablet stops keeping a local copy.** Every successful sync now drops
synced rows older than two days from IndexedDB (`pruneSyncedHistory`). Without
that, devtools would read the whole record straight out of the browser and the
lock would be decoration.

That is why a 4-digit PIN is enough here when it would not be on the device:
ten wrong guesses lock the function for fifteen minutes, so ten thousand
candidates is over a week of continuous guessing rather than a few minutes.

The trade that comes with it: someone on the shop floor could lock you out for
a quarter of an hour by guessing badly on purpose. Fifteen minutes of nuisance
is the right price for taking away an unlimited guessing budget.

## What it is not

It is not an audit trail of who looked. The functions do not log successful
unlocks, so this tells you what the shop did, not who read it.

It needs a connection. That is deliberate — the check happens on the server,
and a version that worked offline would be a version whose secret sits on the
tablet.

For anything this screen does not answer — revenue by service, cash variance
across a month, exports to CSV — `docs/reports.md` has the queries.

## Provisioning the tablet

The History tab, like every other screen that touches the database, needs the
tablet signed in as the shop device. That is done once, on the device, through
the **Set up this tablet** screen — not through a build variable. See the
tablet setup section of the README for why.

If the tablet is ever cleared or replaced, that screen is what comes back, and
the owner enters the device account again. The owner's PIN is unaffected: it
lives in the database and nothing about it is stored on the tablet.
