-- The same migration as 20261018141213, applied a second time by hand
-- (Supabase recorded it under this version). Safe to run twice.

-- New tables: AccessRole, RoleAssignment, TabletRecordingSession, TabletSupportSession
-- New columns: KioskDevice.support_request, KioskDevice.control_command, KioskDevice.control_status, KioskDevice.display_layout, KioskDevice.pickup_sign, KioskDevice.recordings_request, Trip.ended_at, User.disabled_reason, User.is_verified, User.access_role_id
-- Checks: add access_role_name_required, add access_role_sections_required, add kiosk_device_display_layout_allowed, add role_assignment_user_id_required, add tablet_recording_session_device_id_required, add tablet_recording_session_requested_by_required, add tablet_recording_session_state_required, add tablet_recording_session_expires_at_required, add tablet_support_session_device_id_required, add tablet_support_session_requested_by_required, add tablet_support_session_capability_required, add tablet_support_session_state_required, add tablet_support_session_expires_at_required
-- Indexes: access_role_created_date_idx, role_assignment_user_id_idx, role_assignment_role_id_idx, role_assignment_created_date_idx, tablet_recording_session_device_id_idx, tablet_recording_session_company_id_idx, tablet_recording_session_vehicle_id_idx, tablet_recording_session_created_date_idx, tablet_support_session_device_id_idx, tablet_support_session_company_id_idx, tablet_support_session_vehicle_id_idx, tablet_support_session_created_date_idx, app_user_access_role_id_idx

-- AccessRole
create table if not exists public.access_role (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  name text,
  sections jsonb,
  active boolean default true
);
alter table public.access_role enable row level security;
create or replace trigger access_role_touch before update on public.access_role for each row execute function public.touch_updated_date();
do $$ begin
  alter table public.access_role add constraint access_role_name_required check (name is not null) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.access_role add constraint access_role_sections_required check (sections is not null) not valid;
exception when duplicate_object then null; end $$;
create index if not exists access_role_created_date_idx on public.access_role (created_date desc);

alter table public.kiosk_device add column if not exists support_request jsonb;
alter table public.kiosk_device add column if not exists control_command jsonb;
alter table public.kiosk_device add column if not exists control_status jsonb;
alter table public.kiosk_device add column if not exists display_layout text default 'auto';
alter table public.kiosk_device add column if not exists pickup_sign jsonb;
alter table public.kiosk_device add column if not exists recordings_request jsonb;
do $$ begin
  alter table public.kiosk_device add constraint kiosk_device_display_layout_allowed check (display_layout is null or display_layout in ('auto', 'tablet', 'phone')) not valid;
exception when duplicate_object then null; end $$;

-- RoleAssignment
create table if not exists public.role_assignment (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  user_id text,
  role_id text,
  assigned_by text
);
alter table public.role_assignment enable row level security;
create or replace trigger role_assignment_touch before update on public.role_assignment for each row execute function public.touch_updated_date();
do $$ begin
  alter table public.role_assignment add constraint role_assignment_user_id_required check (user_id is not null) not valid;
exception when duplicate_object then null; end $$;
create index if not exists role_assignment_user_id_idx on public.role_assignment (user_id);
create index if not exists role_assignment_role_id_idx on public.role_assignment (role_id);
create index if not exists role_assignment_created_date_idx on public.role_assignment (created_date desc);

-- TabletRecordingSession
create table if not exists public.tablet_recording_session (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  device_id text,
  requested_by text,
  requested_name text,
  state text,
  created_at text,
  expires_at text,
  ended_at text,
  company_id text,
  vehicle_id text,
  kiosk_type text,
  offer_sdp text,
  answer_sdp text
);
alter table public.tablet_recording_session enable row level security;
create or replace trigger tablet_recording_session_touch before update on public.tablet_recording_session for each row execute function public.touch_updated_date();
do $$ begin
  alter table public.tablet_recording_session add constraint tablet_recording_session_device_id_required check (device_id is not null) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.tablet_recording_session add constraint tablet_recording_session_requested_by_required check (requested_by is not null) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.tablet_recording_session add constraint tablet_recording_session_state_required check (state is not null) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.tablet_recording_session add constraint tablet_recording_session_expires_at_required check (expires_at is not null) not valid;
exception when duplicate_object then null; end $$;
create index if not exists tablet_recording_session_device_id_idx on public.tablet_recording_session (device_id);
create index if not exists tablet_recording_session_company_id_idx on public.tablet_recording_session (company_id);
create index if not exists tablet_recording_session_vehicle_id_idx on public.tablet_recording_session (vehicle_id);
create index if not exists tablet_recording_session_created_date_idx on public.tablet_recording_session (created_date desc);

-- TabletSupportSession
create table if not exists public.tablet_support_session (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  device_id text,
  requested_by text,
  requested_name text,
  capability text,
  state text,
  created_at text,
  expires_at text,
  ended_at text,
  company_id text,
  vehicle_id text,
  kiosk_type text,
  transport text,
  offer_sdp text,
  answer_sdp text,
  failure_code text
);
alter table public.tablet_support_session enable row level security;
create or replace trigger tablet_support_session_touch before update on public.tablet_support_session for each row execute function public.touch_updated_date();
do $$ begin
  alter table public.tablet_support_session add constraint tablet_support_session_device_id_required check (device_id is not null) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.tablet_support_session add constraint tablet_support_session_requested_by_required check (requested_by is not null) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.tablet_support_session add constraint tablet_support_session_capability_required check (capability is not null) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.tablet_support_session add constraint tablet_support_session_state_required check (state is not null) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.tablet_support_session add constraint tablet_support_session_expires_at_required check (expires_at is not null) not valid;
exception when duplicate_object then null; end $$;
create index if not exists tablet_support_session_device_id_idx on public.tablet_support_session (device_id);
create index if not exists tablet_support_session_company_id_idx on public.tablet_support_session (company_id);
create index if not exists tablet_support_session_vehicle_id_idx on public.tablet_support_session (vehicle_id);
create index if not exists tablet_support_session_created_date_idx on public.tablet_support_session (created_date desc);

alter table public.trip add column if not exists ended_at timestamptz;

alter table public.app_user add column if not exists disabled_reason text;
alter table public.app_user add column if not exists is_verified boolean;
alter table public.app_user add column if not exists access_role_id text;
create index if not exists app_user_access_role_id_idx on public.app_user (access_role_id);
