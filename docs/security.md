# What this system actually guarantees

Worth being precise about, because the gap between "tamper-evident" and
"tamper-proof" is where false confidence lives.

## The append-only guarantee is real

`transactions` rejects UPDATE and DELETE at the database level — a trigger that
raises on either, plus revoked grants (`supabase/migrations/0002`). There is no
bypass for the service role or the edge functions. Corrections are new rows
carrying the negative of the original amount and a `corrects_transaction_id`
pointing at it, so a cancelled sale shows up as a cancellation rather than as
an absence.

Consequence worth understanding: **a mistake cannot be erased**, only
corrected. This is intended. A system where the manager can quietly fix a
"typo" is a system where the manager can quietly fix anything.

The one thing the trigger does not cover is a superuser connecting directly to
Postgres and dropping the trigger. That is Supabase's dashboard owner — the
shop owner. If that key leaks, the guarantee is gone, and no amount of
application code changes that.

## The tablet's login used to ship to the browser

**Fixed.** The tablet is now provisioned by hand, once, on the device itself,
and nothing is compiled into the bundle but the URL and the anon key. What
follows is what the old arrangement allowed, kept because a build that still
carries those variables still behaves this way — which is why the app says so
in a banner on every screen until they are removed.

`VITE_DEVICE_EMAIL` and `VITE_DEVICE_PASSWORD` are compiled into the bundle —
that is what `VITE_` means, and there is no version of a build-time variable
that is not. So the shop device's Supabase account was readable by anyone who
opened the site and viewed source, and anyone who did could obtain an
`authenticated` session.

Measured against the policies in 0004, that session can:

- read `barbers`, PIN hashes included, which turns "someone holding the
  tablet can brute-force a 4-digit PIN" into "anyone on the internet can";
- **insert transactions and cash counts** — fabricated sales in the shop's
  own books, which the append-only rule then makes impossible to delete;
- read the last two days of transactions.

It cannot read the history, the owner's PIN, MoMo data or reconciliation
reports — that is what migration 0009 closed.

The fabricated-sale path is the one that matters: it corrupts the daily
report, the cash expectation and the rolling medians that the volume checks
learn "normal" from, and it does so in a table designed never to forget.

The fix, now in place, is to stop shipping the credential: the tablet is signed
in once by hand and Supabase persists and refreshes the session. A deploy that
still sets those two variables keeps working, because breaking a live till to
make a point would be its own failure — but it shows the warning until they
are gone.

## PIN verification is attribution, not security

Barbers' PIN hashes sync down to the tablet, because PIN entry has to work
offline — that is a hard requirement, not an oversight. The hashes are
PBKDF2-SHA256 with a per-barber salt at 200,000 iterations, which raises the
cost of a brute force but does not eliminate it: the PIN space is 10,000.
Somebody who steals the tablet, extracts IndexedDB, and is willing to spend
compute will recover every PIN.

So PINs answer "which barber did this cut?" under normal operation. They do not
stop a determined attacker who physically holds the device, and the design does
not depend on them doing so — the reconciliation checks are what catch
misattribution, by cross-referencing against sources the person entering data
does not control.

## What the reconciliation can and cannot see

**Strong:** digital payments. MoMo data comes from MTN, not from staff. If a
sale is logged as MoMo and no MoMo money arrived — or money arrived with no
sale logged — the numbers disagree and the report says so. This is the check
that is hard to defeat from inside the shop.

Worth being blunt about: while `momo_enabled` is false this check is **not
running at all**, and the report says "cash only — not checked" rather than
implying otherwise. A cash-only shop is running on the weaker checks below,
which is a real reduction in coverage — not a configuration detail. It is also
the honest state of affairs until the MoMo merchant account clears, and
pretending otherwise in the nightly report would be worse than saying it.

**Moderate:** cash against the physical count, recomputed server-side from POS
data so a wrong `expected` typed on the tablet cannot paper over a variance.
The expected total is deliberately never shown on the tablet either: a count
taken against a figure already on screen tells whoever holds the cash exactly
what total to produce, which turns the one independent measurement of the day
into a copying exercise.
Defeated by simply not logging the sale and pocketing the cash — the drawer
still balances against what was declared.

**Weak, but the only counter-check for unlogged cash:** volume. An unlogged
cash sale leaves no trace in the POS or in MoMo. The only thing it changes is
that fewer cuts got logged than usual. That is why the volume and cash-ratio
checks exist, and also why they are LOW/MEDIUM rather than HIGH — they are
genuinely noisy. A quiet Tuesday and a skimmed Tuesday look similar.

**Invisible:** manager–barber collusion, and anything requiring judgement about
whether a person is trustworthy. The spec puts this out of scope and it belongs
there. No amount of code addresses it.

## Device silence is treated as a signal

A tablet that stops syncing produces no flags on its own — no data reads as no
problem, which is exactly backwards. Every sync leaves a trace (a `synced_at`
on the rows it pushed, or a heartbeat row when it had nothing to push), and
`computeDeviceGaps` measures the longest silence during opening hours, bounded
by open and close at both ends. More than four hours is flagged.

## Flags are questions, not verdicts

Honest miscounts will outnumber fraud, probably by a lot. The daily report is
worded accordingly and the severity levels exist so that a GHS 60 cash
discrepancy and "MoMo money arrived with no sale logged" do not arrive looking
the same. Treating a LOW flag as an accusation will cost more in trust than it
recovers in cedis.
