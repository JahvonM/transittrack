-- Scheduled jobs on Supabase (step 7 of the move from Base44).
-- 1. GPS points older than 90 days are deleted every night. The live map uses
--    each bus's own current position, and travel-time learning looks back 42 days.
-- 2. The four scheduled functions Base44 runs (base44/workflows) run from here:
--    pg_cron calls them through pg_net with a token only the database holds
--    (Vault secret tt_scheduler_token). base44-compat lets that token act as an
--    admin for those four functions only.
-- The three that email people stay off until app.mcsweenstransport.com moves to
-- Supabase, so nobody gets the same email from both systems. To switch them on:
--   select cron.alter_job(jobid, active := true) from cron.job
--    where jobname in ('tt-maintenance-alerts', 'tt-inspection-alerts', 'tt-weekly-report');

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create schema if not exists tt_ops;
revoke all on schema tt_ops from public, anon, authenticated;

-- Deleting by age needs an index that starts with the time.
create index if not exists location_ping_recorded_at_idx on public.location_ping (recorded_at);
-- Two links the database advisor found without an index.
create index if not exists events_session_id_idx on tablet_support.events (session_id);
create index if not exists sessions_requested_by_idx on tablet_support.sessions (requested_by);

-- Deletes GPS points older than keep_days (never less than a week), a batch at
-- a time so the table is never locked for long. Returns how many went.
create or replace function tt_ops.prune_location_pings(keep_days integer default 90, batch integer default 5000, max_batches integer default 400)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  cutoff timestamptz := now() - make_interval(days => greatest(keep_days, 7));
  total bigint := 0;
  n bigint;
  i integer := 0;
begin
  loop
    delete from public.location_ping
     where id in (select id from public.location_ping where recorded_at < cutoff limit batch);
    get diagnostics n = row_count;
    total := total + n;
    i := i + 1;
    exit when n < batch or i >= max_batches;
  end loop;
  return total;
end
$$;
revoke execute on function tt_ops.prune_location_pings(integer, integer, integer) from public, anon, authenticated;

-- The scheduler's token: made here, never shown anywhere.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'tt_scheduler_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'tt_scheduler_token',
      'Lets pg_cron run the scheduled functions (checked by base44-compat)');
  end if;
end
$$;

-- base44-compat asks this (with the server key) whether a call came from the scheduler.
create or replace function public.tt_scheduler_token_ok(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(length(p_token) = 64 and exists (
    select 1 from vault.decrypted_secrets where name = 'tt_scheduler_token' and decrypted_secret = p_token), false)
$$;
revoke execute on function public.tt_scheduler_token_ok(text) from public, anon, authenticated;
grant execute on function public.tt_scheduler_token_ok(text) to service_role;

-- Calls one of the scheduled functions as the scheduler.
create or replace function tt_ops.run_scheduled_function(fn text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  token text;
begin
  if fn not in ('weeklyReport', 'maintenanceAlerts', 'inspectionAlerts', 'learnTravelTimes') then
    raise exception 'not a scheduled function: %', fn;
  end if;
  select decrypted_secret into token from vault.decrypted_secrets where name = 'tt_scheduler_token';
  return net.http_post(
    url := 'https://ghqpznxqngvhmkiwcauj.supabase.co/functions/v1/' || fn,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-tt-scheduler', token,
      -- the project's public key, as the app sends it
      'apikey', 'sb_publishable_XeQJGv6I-Yicnl3WAu659g_Q7AqBc2C'),
    timeout_milliseconds := 120000);
end
$$;
revoke execute on function tt_ops.run_scheduled_function(text) from public, anon, authenticated;

-- Same times as Base44's workflows (UTC; Grenada is UTC-4).
select cron.schedule('tt-gps-cleanup', '30 7 * * *', $cron$select tt_ops.prune_location_pings()$cron$);
select cron.schedule('tt-travel-times', '15 7 * * *', $cron$select tt_ops.run_scheduled_function('learnTravelTimes')$cron$);
select cron.schedule('tt-maintenance-alerts', '0 11 * * *', $cron$select tt_ops.run_scheduled_function('maintenanceAlerts')$cron$);
select cron.schedule('tt-inspection-alerts', '5 11 * * *', $cron$select tt_ops.run_scheduled_function('inspectionAlerts')$cron$);
select cron.schedule('tt-weekly-report', '0 12 * * 1', $cron$select tt_ops.run_scheduled_function('weeklyReport')$cron$);

-- The emails wait for the switch-over (see the top).
select cron.alter_job(jobid, active := false)
  from cron.job
 where jobname in ('tt-maintenance-alerts', 'tt-inspection-alerts', 'tt-weekly-report');
