-- Cash-only mode.
--
-- The shop can run without mobile money and switch it on later with one flag,
-- rather than needing a new build or a code change on the day the MTN merchant
-- account finally clears.
--
-- While momo_enabled is false:
--   * the tablet offers cash only, and skips the payment step entirely —
--     a screen that asks "how did they pay?" with one answer teaches the
--     manager to tap without reading;
--   * Check A is SKIPPED, not run against a feed that does not exist.
--     Running it anyway would flag every digital row as money that never
--     arrived — technically true, useless nightly, and the fastest way to
--     teach the owner to ignore the report.
--
-- Skipping is not silence. If a digital sale gets logged anyway, or MoMo money
-- turns up from a feed nobody configured, the settings no longer describe the
-- business, and the nightly job raises one MEDIUM flag saying exactly that.
--
-- Defaults to false: a shop that has not finished MoMo onboarding should not
-- be offering payment methods it cannot reconcile. Turn it on with
--   update shop_settings set momo_enabled = true;
-- and the change reaches the tablet on its next sync.

alter table shop_settings
  add column momo_enabled boolean not null default false;
