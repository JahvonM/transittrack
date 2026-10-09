-- S06 foundation. Apply only to the dedicated TransitTrack Supabase project.
-- This migration does not move application records or activate backend callers.
begin;
create schema if not exists tt_atomic;
revoke all on schema tt_atomic from public, anon, authenticated;
create table if not exists tt_atomic.budget_policy (
 scope_hash text primary key check (scope_hash ~ '^[a-f0-9]{64}$'),
 attempt_limit integer not null check (attempt_limit between 1 and 10000),
 window_ms bigint not null check (window_ms between 1000 and 86400000)
);
create table if not exists tt_atomic.attempt_reservation (
 scope_hash text not null references tt_atomic.budget_policy(scope_hash),
 request_id uuid not null,
 allowed boolean not null,
 attempted_at timestamptz not null,
 primary key (scope_hash, request_id)
);
create index if not exists attempt_reservation_window
 on tt_atomic.attempt_reservation (scope_hash, attempted_at) where allowed;
alter table tt_atomic.budget_policy enable row level security;
alter table tt_atomic.attempt_reservation enable row level security;
revoke all on all tables in schema tt_atomic from public, anon, authenticated, service_role;
create or replace function public.tt_reserve_attempt(
 p_scope_hash text, p_request_id uuid, p_limit integer, p_window_ms bigint
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
 policy tt_atomic.budget_policy%rowtype;
 previous boolean;
 accepted boolean;
 budget_now timestamptz;
 total bigint;
begin
 if p_scope_hash is null or p_scope_hash !~ '^[a-f0-9]{64}$'
  or p_request_id is null or p_limit is null or p_limit not between 1 and 10000
  or p_window_ms is null or p_window_ms not between 1000 and 86400000 then
  raise exception 'Invalid budget request' using errcode = '22023';
 end if;
 insert into tt_atomic.budget_policy values (p_scope_hash,p_limit,p_window_ms)
  on conflict (scope_hash) do nothing;
 -- A stable unique policy row serializes all transactions for this budget.
 select * into strict policy from tt_atomic.budget_policy
  where scope_hash=p_scope_hash for update;
 if policy.attempt_limit <> p_limit or policy.window_ms <> p_window_ms then
  raise exception 'Budget policy mismatch' using errcode = '22023';
 end if;
 select allowed into previous from tt_atomic.attempt_reservation
  where scope_hash=p_scope_hash and request_id=p_request_id;
 if found then return previous; end if;
 -- Sample time AFTER obtaining the lock, not at transaction start.
 budget_now := pg_catalog.clock_timestamp();
 select count(*) into total from tt_atomic.attempt_reservation
  where scope_hash=p_scope_hash and allowed
  and attempted_at > budget_now - p_window_ms * interval '1 millisecond';
 accepted := total < p_limit;
 insert into tt_atomic.attempt_reservation values
  (p_scope_hash,p_request_id,accepted,budget_now);
 return accepted;
end $$;
revoke all on function public.tt_reserve_attempt(text,uuid,integer,bigint)
 from public, anon, authenticated;
grant execute on function public.tt_reserve_attempt(text,uuid,integer,bigint) to service_role;
comment on function public.tt_reserve_attempt(text,uuid,integer,bigint) is
 'Backend-only rolling budget reservation. Same request UUID recovers the same decision. Does not make external side effects exactly-once.';
commit;
