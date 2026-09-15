-- Read the cron job's URL and key from Vault instead of database settings.
--
-- 0005 used current_setting('app.settings.*'), which requires the values to be
-- set with `alter database postgres set ...`. That needs superuser, and hosted
-- Supabase does not grant it:
--
--   ERROR: 42501: permission denied to set parameter "app.settings.project_url"
--
-- So the job as scheduled in 0005 would have failed at 21:30 with nothing to
-- read — the worst kind of failure here, because a reconciliation that never
-- runs looks exactly like a night with nothing to report.
--
-- Supabase Vault is the supported place for this. The values are stored
-- encrypted and read back at run time by the job, which runs as postgres.
--
-- Before this helps, create the two secrets once (values are yours, so they
-- are not in the repository):
--
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<service-role-key>',        'service_role_key');
--
-- To rotate the key later, update the secret rather than editing this job:
--
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'service_role_key'),
--     '<new-service-role-key>'
--   );

do $$
begin
  if exists (select 1 from cron.job where jobname = 'nightly-reconciliation') then
    perform cron.unschedule('nightly-reconciliation');
  end if;
end $$;

-- 21:30 local — 90 minutes after the 20:00 close, which gives the manager time
-- to finish the cash count and the tablet time to drain its queue.
select cron.schedule(
  'nightly-reconciliation',
  '30 21 * * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret from vault.decrypted_secrets where name = 'project_url'
    ) || '/functions/v1/nightly-reconciliation',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
