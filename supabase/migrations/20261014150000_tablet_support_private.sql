-- Prepared only: apply through the migration workflow after backend auth wiring.
-- This schema is deliberately NOT exposed through the browser Data API.
begin;
create schema if not exists tablet_support;
revoke all on schema tablet_support from public, anon, authenticated;
grant usage on schema tablet_support to service_role;

create table tablet_support.sessions (
 id uuid primary key default gen_random_uuid(),
 device_id text not null references public.kiosk_device(id),
 requested_by text not null references public.app_user(id),
 capability text not null check (capability in ('screen','camera_front','camera_back')),
 state text not null default 'requested' check (state in ('requested','waiting_permission','active','ended','denied','failed','expired')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 ended_at timestamptz,
 check (expires_at > created_at and expires_at <= created_at + interval '10 minutes'),
 check ((state in ('ended','denied','failed','expired')) = (ended_at is not null))
);
-- A server transaction first expires old requests, then creates a new one.
create unique index tablet_support_one_open_session on tablet_support.sessions(device_id)
 where state in ('requested','waiting_permission','active');
create index tablet_support_expiry on tablet_support.sessions(expires_at)
 where state in ('requested','waiting_permission','active');

create table tablet_support.events (
 id bigint generated always as identity primary key,
 session_id uuid not null references tablet_support.sessions(id),
 actor_id text not null,
 event text not null check (event in ('requested','waiting_permission','active','ended','denied','failed','expired')),
 occurred_at timestamptz not null default now()
);
-- No camera frames, screenshots, SDP, PINs or Wi-Fi passwords in audit events.
alter table tablet_support.sessions enable row level security;
alter table tablet_support.events enable row level security;
revoke all on all tables in schema tablet_support from public, anon, authenticated;
revoke all on all sequences in schema tablet_support from public, anon, authenticated;
grant select,insert,update on tablet_support.sessions to service_role;
grant select,insert on tablet_support.events to service_role;
grant usage,select on all sequences in schema tablet_support to service_role;
commit;
