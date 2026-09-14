-- Stop polling MoMo until MoMo is actually live.
--
-- 0005 scheduled momo-sync every 15 minutes, which made sense when MoMo was
-- assumed to be part of opening day. It isn't: the shop opens cash-only with
-- shop_settings.momo_enabled false (0006). With no credentials configured the
-- function returns "skipped" and exits — harmless, but that is ~96 pointless
-- invocations and log lines a day, for however many months the merchant
-- account takes. Noise in the logs is not free: it is where a real failure
-- goes to hide.
--
-- The nightly-reconciliation job stays scheduled. It is what emails the owner
-- every day and what builds the baseline the rolling-median checks need, and
-- it runs perfectly well with no MoMo data.
--
-- Written to be safe on a database where the job was never created (a fresh
-- deploy applying 0005 and 0007 in one pass) — cron.unschedule() raises if the
-- job is missing, so it is guarded rather than assumed.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'momo-sync') then
    perform cron.unschedule('momo-sync');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- When MoMo goes live, re-schedule it by running this (see README, "Switching
-- MoMo on later" — the flag, the secrets and this job are the three steps):
--
--   select cron.schedule(
--     'momo-sync',
--     '*/15 * * * *',
--     $job$
--     select net.http_post(
--       url := current_setting('app.settings.project_url') || '/functions/v1/momo-sync',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
--       ),
--       body := '{}'::jsonb
--     );
--     $job$
--   );
-- ---------------------------------------------------------------------------
