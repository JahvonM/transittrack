-- TransitTrack tables, generated from base44/entities by tools/supabase/gen-schema.mjs.
-- Do not edit by hand: change the entity schema and run the generator again.

-- New ids look like Base44's: 24 hex characters.
create or replace function public.new_id() returns text
language sql volatile as $$ select substr(replace(gen_random_uuid()::text, '-', ''), 1, 24) $$;

-- updated_date follows every change.
create or replace function public.touch_updated_date() returns trigger
language plpgsql as $$ begin new.updated_date := now(); return new; end $$;


-- Advertisement
create table if not exists public.advertisement (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  title text,
  message text,
  image_url text,
  link text,
  active boolean default true,
  "order" double precision default 0,
  company_id text
);
create or replace trigger advertisement_touch before update on public.advertisement for each row execute function public.touch_updated_date();
alter table public.advertisement add constraint advertisement_title_required check (title is not null) not valid;
create index if not exists advertisement_company_id_idx on public.advertisement (company_id);
create index if not exists advertisement_created_date_idx on public.advertisement (created_date desc);

-- AppSupportSetting
create table if not exists public.app_support_setting (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  whatsapp_number text
);
create or replace trigger app_support_setting_touch before update on public.app_support_setting for each row execute function public.touch_updated_date();
create index if not exists app_support_setting_created_date_idx on public.app_support_setting (created_date desc);

-- AuditLog
create table if not exists public.audit_log (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  actor_email text,
  actor_name text,
  actor_role text,
  action text,
  entity text,
  record_id text,
  summary text,
  changes text,
  page text,
  card_uid text,
  status text
);
create or replace trigger audit_log_touch before update on public.audit_log for each row execute function public.touch_updated_date();
alter table public.audit_log add constraint audit_log_action_allowed check (action is null or action in ('create', 'update', 'delete', 'card_programmed', 'card_verified', 'card_rejected', 'card_revoked')) not valid;
alter table public.audit_log add constraint audit_log_status_allowed check (status is null or status in ('SUCCESS', 'ERROR')) not valid;
create index if not exists audit_log_actor_email_idx on public.audit_log (actor_email);
create index if not exists audit_log_record_id_idx on public.audit_log (record_id);
create index if not exists audit_log_created_date_idx on public.audit_log (created_date desc);

-- Broadcast
create table if not exists public.broadcast (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  "type" text default 'info',
  title text,
  message text,
  vehicle_name text,
  company_id text,
  company_name text,
  driver_name text,
  driver_email text,
  is_reply boolean default false,
  vehicle_id text,
  return_pickup boolean default false
);
create or replace trigger broadcast_touch before update on public.broadcast for each row execute function public.touch_updated_date();
alter table public.broadcast add constraint broadcast_type_allowed check ("type" is null or "type" in ('bus_arrived', 'taxi_arrived', 'info')) not valid;
alter table public.broadcast add constraint broadcast_type_required check ("type" is not null) not valid;
alter table public.broadcast add constraint broadcast_message_required check (message is not null) not valid;
create index if not exists broadcast_company_id_idx on public.broadcast (company_id);
create index if not exists broadcast_driver_email_idx on public.broadcast (driver_email);
create index if not exists broadcast_vehicle_id_idx on public.broadcast (vehicle_id);
create index if not exists broadcast_created_date_idx on public.broadcast (created_date desc);

-- CardHolder
create table if not exists public.card_holder (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  full_name text,
  employee_id text,
  role text default 'Other',
  assigned_vehicle text,
  company_id text,
  company_name text,
  notes text
);
create or replace trigger card_holder_touch before update on public.card_holder for each row execute function public.touch_updated_date();
alter table public.card_holder add constraint card_holder_role_allowed check (role is null or role in ('Dispatcher', 'Inspector', 'Supervisor', 'Cleaner', 'Security', 'Other')) not valid;
alter table public.card_holder add constraint card_holder_full_name_required check (full_name is not null) not valid;
create index if not exists card_holder_employee_id_idx on public.card_holder (employee_id);
create index if not exists card_holder_company_id_idx on public.card_holder (company_id);
create index if not exists card_holder_created_date_idx on public.card_holder (created_date desc);

-- Client
create table if not exists public.client (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  company_id text,
  name text,
  kind text default 'hotel',
  contact_name text,
  email text,
  phone text,
  address text,
  currency text default 'XCD',
  notes text
);
create or replace trigger client_touch before update on public.client for each row execute function public.touch_updated_date();
alter table public.client add constraint client_kind_allowed check (kind is null or kind in ('hotel', 'company', 'tour_operator', 'person', 'other')) not valid;
alter table public.client add constraint client_name_required check (name is not null) not valid;
create index if not exists client_company_id_idx on public.client (company_id);
create index if not exists client_email_idx on public.client (email);
create index if not exists client_created_date_idx on public.client (created_date desc);

-- ClientError
create table if not exists public.client_error (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  message text,
  stack text,
  url text,
  user_email text,
  user_role text,
  user_agent text,
  source text,
  device_id text,
  emailed boolean default false,
  area text,
  context jsonb,
  breadcrumbs jsonb,
  status text default 'new',
  resolved_at timestamptz,
  resolved_by text
);
create or replace trigger client_error_touch before update on public.client_error for each row execute function public.touch_updated_date();
alter table public.client_error add constraint client_error_status_allowed check (status is null or status in ('new', 'resolved')) not valid;
alter table public.client_error add constraint client_error_message_required check (message is not null) not valid;
create index if not exists client_error_user_email_idx on public.client_error (user_email);
create index if not exists client_error_device_id_idx on public.client_error (device_id);
create index if not exists client_error_created_date_idx on public.client_error (created_date desc);

-- Company
create table if not exists public.company (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  name text,
  logo_url text,
  phone text,
  access_code text,
  service_types jsonb,
  description text,
  boss_phone text,
  secretary_phone text,
  access_code_expires_at timestamptz
);
create or replace trigger company_touch before update on public.company for each row execute function public.touch_updated_date();
alter table public.company add constraint company_name_required check (name is not null) not valid;
create index if not exists company_created_date_idx on public.company (created_date desc);

-- CompanyAccessGrant
create table if not exists public.company_access_grant (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  user_id text,
  company_id text,
  token_hash text,
  code_hash text,
  expires_at text
);
create or replace trigger company_access_grant_touch before update on public.company_access_grant for each row execute function public.touch_updated_date();
create index if not exists company_access_grant_user_id_idx on public.company_access_grant (user_id);
create index if not exists company_access_grant_company_id_idx on public.company_access_grant (company_id);
create index if not exists company_access_grant_created_date_idx on public.company_access_grant (created_date desc);

-- CompanyMembership
create table if not exists public.company_membership (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  user_id text,
  company_id text,
  scope text,
  active boolean,
  expires_at text,
  code_hash text,
  vehicle_id text,
  vehicle_name text
);
create or replace trigger company_membership_touch before update on public.company_membership for each row execute function public.touch_updated_date();
alter table public.company_membership add constraint company_membership_scope_allowed check (scope is null or scope in ('manager', 'passenger')) not valid;
alter table public.company_membership add constraint company_membership_user_id_required check (user_id is not null) not valid;
alter table public.company_membership add constraint company_membership_company_id_required check (company_id is not null) not valid;
alter table public.company_membership add constraint company_membership_scope_required check (scope is not null) not valid;
alter table public.company_membership add constraint company_membership_active_required check (active is not null) not valid;
create index if not exists company_membership_user_id_idx on public.company_membership (user_id);
create index if not exists company_membership_company_id_idx on public.company_membership (company_id);
create index if not exists company_membership_vehicle_id_idx on public.company_membership (vehicle_id);
create index if not exists company_membership_created_date_idx on public.company_membership (created_date desc);

-- Contact
create table if not exists public.contact (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  name text,
  phone text,
  email text,
  "type" text default 'passenger',
  nfc_card_tag text,
  access_code text,
  company_id text,
  company_name text,
  pickup_name text,
  pickup_lat double precision,
  pickup_lng double precision,
  dropoff_name text,
  dropoff_lat double precision,
  dropoff_lng double precision,
  employee_id text,
  vehicle_id text,
  vehicle_name text
);
create or replace trigger contact_touch before update on public.contact for each row execute function public.touch_updated_date();
alter table public.contact add constraint contact_type_allowed check ("type" is null or "type" in ('staff', 'passenger')) not valid;
alter table public.contact add constraint contact_name_required check (name is not null) not valid;
alter table public.contact add constraint contact_type_required check ("type" is not null) not valid;
create index if not exists contact_email_idx on public.contact (email);
create index if not exists contact_company_id_idx on public.contact (company_id);
create index if not exists contact_employee_id_idx on public.contact (employee_id);
create index if not exists contact_vehicle_id_idx on public.contact (vehicle_id);
create index if not exists contact_created_date_idx on public.contact (created_date desc);

-- DeviceCredential
create table if not exists public.device_credential (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  device_id text,
  token_hash text,
  company_id text,
  vehicle_id text,
  kiosk_type text,
  pairing_code_hash text,
  issued_at text,
  expires_at text
);
create or replace trigger device_credential_touch before update on public.device_credential for each row execute function public.touch_updated_date();
alter table public.device_credential add constraint device_credential_device_id_required check (device_id is not null) not valid;
alter table public.device_credential add constraint device_credential_token_hash_required check (token_hash is not null) not valid;
alter table public.device_credential add constraint device_credential_issued_at_required check (issued_at is not null) not valid;
alter table public.device_credential add constraint device_credential_expires_at_required check (expires_at is not null) not valid;
create index if not exists device_credential_device_id_idx on public.device_credential (device_id);
create index if not exists device_credential_company_id_idx on public.device_credential (company_id);
create index if not exists device_credential_vehicle_id_idx on public.device_credential (vehicle_id);
create index if not exists device_credential_created_date_idx on public.device_credential (created_date desc);

-- Driver
create table if not exists public.driver (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  full_name text,
  email text,
  phone text,
  photo_url text,
  company_id text,
  company_name text,
  employee_id text,
  nfc_card_uid text,
  phone_app_access boolean default false
);
create or replace trigger driver_touch before update on public.driver for each row execute function public.touch_updated_date();
alter table public.driver add constraint driver_full_name_required check (full_name is not null) not valid;
create index if not exists driver_email_idx on public.driver (email);
create index if not exists driver_company_id_idx on public.driver (company_id);
create index if not exists driver_employee_id_idx on public.driver (employee_id);
create index if not exists driver_created_date_idx on public.driver (created_date desc);

-- DriverDocument
create table if not exists public.driver_document (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  driver_id text,
  driver_name text,
  company_id text,
  kind text,
  file_uri text,
  file_name text,
  document_number text,
  expiry_date date,
  notes text
);
create or replace trigger driver_document_touch before update on public.driver_document for each row execute function public.touch_updated_date();
alter table public.driver_document add constraint driver_document_kind_allowed check (kind is null or kind in ('license', 'insurance')) not valid;
alter table public.driver_document add constraint driver_document_driver_id_required check (driver_id is not null) not valid;
alter table public.driver_document add constraint driver_document_kind_required check (kind is not null) not valid;
create index if not exists driver_document_driver_id_idx on public.driver_document (driver_id);
create index if not exists driver_document_company_id_idx on public.driver_document (company_id);
create index if not exists driver_document_created_date_idx on public.driver_document (created_date desc);

-- DriverPinCredential
create table if not exists public.driver_pin_credential (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  vehicle_id text,
  company_id text,
  salt text,
  pin_hash text,
  enabled boolean
);
create or replace trigger driver_pin_credential_touch before update on public.driver_pin_credential for each row execute function public.touch_updated_date();
create index if not exists driver_pin_credential_vehicle_id_idx on public.driver_pin_credential (vehicle_id);
create index if not exists driver_pin_credential_company_id_idx on public.driver_pin_credential (company_id);
create index if not exists driver_pin_credential_created_date_idx on public.driver_pin_credential (created_date desc);

-- DriverRequest -- A driver's day-off or shift-swap request from the driver phone app, approved or declined by an administrator.
create table if not exists public.driver_request (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  company_id text,
  company_name text,
  driver_id text,
  driver_name text,
  driver_email text,
  kind text,
  start_date text,
  end_date text,
  swap_with_driver_id text,
  swap_with_name text,
  note text,
  status text default 'pending',
  decided_by_name text,
  decided_at timestamptz,
  decision_note text
);
create or replace trigger driver_request_touch before update on public.driver_request for each row execute function public.touch_updated_date();
alter table public.driver_request add constraint driver_request_kind_allowed check (kind is null or kind in ('day_off', 'swap')) not valid;
alter table public.driver_request add constraint driver_request_status_allowed check (status is null or status in ('pending', 'approved', 'declined', 'cancelled')) not valid;
alter table public.driver_request add constraint driver_request_company_id_required check (company_id is not null) not valid;
alter table public.driver_request add constraint driver_request_driver_id_required check (driver_id is not null) not valid;
alter table public.driver_request add constraint driver_request_kind_required check (kind is not null) not valid;
alter table public.driver_request add constraint driver_request_start_date_required check (start_date is not null) not valid;
create index if not exists driver_request_company_id_idx on public.driver_request (company_id);
create index if not exists driver_request_driver_id_idx on public.driver_request (driver_id);
create index if not exists driver_request_driver_email_idx on public.driver_request (driver_email);
create index if not exists driver_request_swap_with_driver_id_idx on public.driver_request (swap_with_driver_id);
create index if not exists driver_request_created_date_idx on public.driver_request (created_date desc);

-- DriverShift
create table if not exists public.driver_shift (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  vehicle_id text,
  vehicle_name text,
  company_id text,
  company_name text,
  driver_name text,
  driver_email text,
  device_id text,
  started_at timestamptz,
  ended_at timestamptz,
  duration_minutes double precision,
  started_with text,
  ended_with text,
  notes text,
  client_request_id text,
  request_hash text,
  end_request_id text,
  end_request_hash text
);
create or replace trigger driver_shift_touch before update on public.driver_shift for each row execute function public.touch_updated_date();
alter table public.driver_shift add constraint driver_shift_vehicle_id_required check (vehicle_id is not null) not valid;
alter table public.driver_shift add constraint driver_shift_started_at_required check (started_at is not null) not valid;
create index if not exists driver_shift_vehicle_id_idx on public.driver_shift (vehicle_id);
create index if not exists driver_shift_company_id_idx on public.driver_shift (company_id);
create index if not exists driver_shift_driver_email_idx on public.driver_shift (driver_email);
create index if not exists driver_shift_device_id_idx on public.driver_shift (device_id);
create index if not exists driver_shift_client_request_id_idx on public.driver_shift (client_request_id);
create index if not exists driver_shift_end_request_id_idx on public.driver_shift (end_request_id);
create index if not exists driver_shift_created_date_idx on public.driver_shift (created_date desc);

-- DrivingEvent
create table if not exists public.driving_event (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  company_id text,
  company_name text,
  driver_email text,
  driver_name text,
  lat double precision,
  lng double precision,
  occurred_at timestamptz,
  speed_after_kmh double precision,
  speed_before_kmh double precision,
  "type" text default 'hard_brake',
  vehicle_id text,
  vehicle_name text
);
create or replace trigger driving_event_touch before update on public.driving_event for each row execute function public.touch_updated_date();
alter table public.driving_event add constraint driving_event_type_allowed check ("type" is null or "type" in ('hard_brake', 'rapid_accel', 'crash')) not valid;
alter table public.driving_event add constraint driving_event_vehicle_id_required check (vehicle_id is not null) not valid;
alter table public.driving_event add constraint driving_event_company_id_required check (company_id is not null) not valid;
alter table public.driving_event add constraint driving_event_type_required check ("type" is not null) not valid;
alter table public.driving_event add constraint driving_event_occurred_at_required check (occurred_at is not null) not valid;
create index if not exists driving_event_company_id_idx on public.driving_event (company_id);
create index if not exists driving_event_driver_email_idx on public.driving_event (driver_email);
create index if not exists driving_event_vehicle_id_idx on public.driving_event (vehicle_id);
create index if not exists driving_event_created_date_idx on public.driving_event (created_date desc);

-- Fault
create table if not exists public.fault (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  vehicle_id text,
  vehicle_name text,
  company_id text,
  company_name text,
  title text,
  description text,
  source text default 'manual',
  inspection_id text,
  severity text default 'medium',
  status text default 'open',
  photo_url text,
  repair_required boolean default false,
  reported_by text,
  resolved_date date,
  client_request_id text,
  request_hash text,
  request_actor_id text
);
create or replace trigger fault_touch before update on public.fault for each row execute function public.touch_updated_date();
alter table public.fault add constraint fault_source_allowed check (source is null or source in ('inspection', 'manual')) not valid;
alter table public.fault add constraint fault_severity_allowed check (severity is null or severity in ('low', 'medium', 'high', 'critical')) not valid;
alter table public.fault add constraint fault_status_allowed check (status is null or status in ('open', 'in_progress', 'resolved')) not valid;
alter table public.fault add constraint fault_vehicle_id_required check (vehicle_id is not null) not valid;
alter table public.fault add constraint fault_title_required check (title is not null) not valid;
alter table public.fault add constraint fault_company_id_required check (company_id is not null) not valid;
create index if not exists fault_vehicle_id_idx on public.fault (vehicle_id);
create index if not exists fault_company_id_idx on public.fault (company_id);
create index if not exists fault_inspection_id_idx on public.fault (inspection_id);
create index if not exists fault_client_request_id_idx on public.fault (client_request_id);
create index if not exists fault_request_actor_id_idx on public.fault (request_actor_id);
create index if not exists fault_created_date_idx on public.fault (created_date desc);

-- FrontDeskSignIns
create table if not exists public.front_desk_sign_ins (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  full_name text,
  company_name text,
  reason text,
  signature_url text,
  signed_at timestamptz
);
create or replace trigger front_desk_sign_ins_touch before update on public.front_desk_sign_ins for each row execute function public.touch_updated_date();
alter table public.front_desk_sign_ins add constraint front_desk_sign_ins_full_name_required check (full_name is not null) not valid;
alter table public.front_desk_sign_ins add constraint front_desk_sign_ins_signed_at_required check (signed_at is not null) not valid;
create index if not exists front_desk_sign_ins_created_date_idx on public.front_desk_sign_ins (created_date desc);

-- GroupMessage
create table if not exists public.group_message (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  vehicle_id text,
  vehicle_name text,
  company_id text,
  company_name text,
  channel text default 'staff',
  sender_role text,
  sender_name text,
  text text,
  message_type text default 'text',
  media_url text,
  edited boolean default false,
  sender_id text,
  sender_email text
);
create or replace trigger group_message_touch before update on public.group_message for each row execute function public.touch_updated_date();
alter table public.group_message add constraint group_message_channel_allowed check (channel is null or channel in ('staff', 'company', 'dispatch', 'mechanic')) not valid;
alter table public.group_message add constraint group_message_sender_role_allowed check (sender_role is null or sender_role in ('driver', 'staff', 'admin', 'company', 'mechanic')) not valid;
alter table public.group_message add constraint group_message_message_type_allowed check (message_type is null or message_type in ('text', 'image', 'audio')) not valid;
alter table public.group_message add constraint group_message_vehicle_id_required check (vehicle_id is not null) not valid;
alter table public.group_message add constraint group_message_sender_role_required check (sender_role is not null) not valid;
alter table public.group_message add constraint group_message_text_required check (text is not null) not valid;
create index if not exists group_message_vehicle_id_idx on public.group_message (vehicle_id);
create index if not exists group_message_company_id_idx on public.group_message (company_id);
create index if not exists group_message_sender_id_idx on public.group_message (sender_id);
create index if not exists group_message_sender_email_idx on public.group_message (sender_email);
create index if not exists group_message_created_date_idx on public.group_message (created_date desc);

-- Incident
create table if not exists public.incident (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  vehicle_id text,
  vehicle_name text,
  company_id text,
  company_name text,
  driver_name text,
  driver_email text,
  "type" text default 'other',
  details text,
  occurred_at timestamptz,
  photo_uris jsonb,
  source text,
  status text default 'open'
);
create or replace trigger incident_touch before update on public.incident for each row execute function public.touch_updated_date();
alter table public.incident add constraint incident_type_allowed check ("type" is null or "type" in ('speeding', 'emergency', 'breakdown', 'accident', 'delay', 'other')) not valid;
alter table public.incident add constraint incident_status_allowed check (status is null or status in ('open', 'investigating', 'resolved')) not valid;
alter table public.incident add constraint incident_type_required check ("type" is not null) not valid;
alter table public.incident add constraint incident_company_id_required check (company_id is not null) not valid;
create index if not exists incident_vehicle_id_idx on public.incident (vehicle_id);
create index if not exists incident_company_id_idx on public.incident (company_id);
create index if not exists incident_driver_email_idx on public.incident (driver_email);
create index if not exists incident_created_date_idx on public.incident (created_date desc);

-- Inspection
create table if not exists public.inspection (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  driver_name text,
  driver_email text,
  vehicle_id text,
  vehicle_name text,
  company_id text,
  company_name text,
  date date,
  status text default 'passed',
  checklist jsonb,
  odometer_reading double precision,
  fuel_level double precision,
  needs_service boolean default false,
  service_notes text,
  template_id text,
  template_name text,
  trigger text,
  results jsonb,
  client_request_id text,
  request_hash text,
  request_actor_id text
);
create or replace trigger inspection_touch before update on public.inspection for each row execute function public.touch_updated_date();
alter table public.inspection add constraint inspection_status_allowed check (status is null or status in ('passed', 'failed')) not valid;
alter table public.inspection add constraint inspection_driver_name_required check (driver_name is not null) not valid;
alter table public.inspection add constraint inspection_vehicle_id_required check (vehicle_id is not null) not valid;
alter table public.inspection add constraint inspection_company_id_required check (company_id is not null) not valid;
alter table public.inspection add constraint inspection_date_required check (date is not null) not valid;
create index if not exists inspection_driver_email_idx on public.inspection (driver_email);
create index if not exists inspection_vehicle_id_idx on public.inspection (vehicle_id);
create index if not exists inspection_company_id_idx on public.inspection (company_id);
create index if not exists inspection_template_id_idx on public.inspection (template_id);
create index if not exists inspection_client_request_id_idx on public.inspection (client_request_id);
create index if not exists inspection_request_actor_id_idx on public.inspection (request_actor_id);
create index if not exists inspection_created_date_idx on public.inspection (created_date desc);

-- InspectionResult
create table if not exists public.inspection_result (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  vehicle_id text,
  vehicle_name text,
  company_id text,
  company_name text,
  inspection_name text,
  section_name text,
  inspection_item text,
  condition text default 'PENDING',
  fault_found boolean default false,
  fault_description text,
  photo_url text,
  repair_required boolean default false,
  notes text,
  inspector_id text,
  inspector_name text,
  inspection_date timestamptz,
  client_request_id text,
  request_hash text,
  request_actor_id text
);
create or replace trigger inspection_result_touch before update on public.inspection_result for each row execute function public.touch_updated_date();
alter table public.inspection_result add constraint inspection_result_condition_allowed check (condition is null or condition in ('GOOD', 'WARNING', 'FAILED', 'PENDING')) not valid;
alter table public.inspection_result add constraint inspection_result_vehicle_id_required check (vehicle_id is not null) not valid;
alter table public.inspection_result add constraint inspection_result_inspection_name_required check (inspection_name is not null) not valid;
alter table public.inspection_result add constraint inspection_result_inspection_item_required check (inspection_item is not null) not valid;
create index if not exists inspection_result_vehicle_id_idx on public.inspection_result (vehicle_id);
create index if not exists inspection_result_company_id_idx on public.inspection_result (company_id);
create index if not exists inspection_result_inspector_id_idx on public.inspection_result (inspector_id);
create index if not exists inspection_result_client_request_id_idx on public.inspection_result (client_request_id);
create index if not exists inspection_result_request_actor_id_idx on public.inspection_result (request_actor_id);
create index if not exists inspection_result_created_date_idx on public.inspection_result (created_date desc);

-- InspectionTemplate
create table if not exists public.inspection_template (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  name text,
  category text,
  company_id text,
  company_name text,
  frequency_days double precision,
  audience text default 'mechanic',
  driver_trigger text default 'start_of_day',
  driver_days jsonb,
  driver_times jsonb,
  driver_vehicle_ids jsonb,
  xray_layout text default 'front_engine',
  driver_from_time text,
  driver_required boolean default true,
  driver_sent_at timestamptz,
  sections jsonb
);
create or replace trigger inspection_template_touch before update on public.inspection_template for each row execute function public.touch_updated_date();
alter table public.inspection_template add constraint inspection_template_audience_allowed check (audience is null or audience in ('mechanic', 'driver', 'both')) not valid;
alter table public.inspection_template add constraint inspection_template_driver_trigger_allowed check (driver_trigger is null or driver_trigger in ('start_of_day', 'at_times', 'shift_start', 'shift_end', 'on_demand')) not valid;
alter table public.inspection_template add constraint inspection_template_xray_layout_allowed check (xray_layout is null or xray_layout in ('front_engine', 'minibus', 'city_rear')) not valid;
alter table public.inspection_template add constraint inspection_template_name_required check (name is not null) not valid;
create index if not exists inspection_template_company_id_idx on public.inspection_template (company_id);
create index if not exists inspection_template_created_date_idx on public.inspection_template (created_date desc);

-- Invoice
create table if not exists public.invoice (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  company_id text,
  company_name text,
  client_id text,
  client_name text,
  client_email text,
  client_address text,
  number text,
  period_start date,
  period_end date,
  issued_at timestamptz,
  due_date date,
  lines jsonb,
  total double precision,
  currency text default 'XCD',
  status text default 'draft',
  sent_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,
  notes text
);
create or replace trigger invoice_touch before update on public.invoice for each row execute function public.touch_updated_date();
alter table public.invoice add constraint invoice_status_allowed check (status is null or status in ('draft', 'sent', 'paid', 'void')) not valid;
alter table public.invoice add constraint invoice_client_id_required check (client_id is not null) not valid;
alter table public.invoice add constraint invoice_number_required check (number is not null) not valid;
create index if not exists invoice_company_id_idx on public.invoice (company_id);
create index if not exists invoice_client_id_idx on public.invoice (client_id);
create index if not exists invoice_client_email_idx on public.invoice (client_email);
create index if not exists invoice_created_date_idx on public.invoice (created_date desc);

-- JobRun
create table if not exists public.job_run (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  job text,
  ran_at timestamptz,
  trigger text,
  summary text
);
create or replace trigger job_run_touch before update on public.job_run for each row execute function public.touch_updated_date();
alter table public.job_run add constraint job_run_trigger_allowed check (trigger is null or trigger in ('schedule', 'admin')) not valid;
alter table public.job_run add constraint job_run_job_required check (job is not null) not valid;
alter table public.job_run add constraint job_run_ran_at_required check (ran_at is not null) not valid;
create index if not exists job_run_created_date_idx on public.job_run (created_date desc);

-- KioskDevice
create table if not exists public.kiosk_device (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  company_id text,
  company_name text,
  device_info text,
  update_requested_at timestamptz,
  directory_sent_at timestamptz,
  app_health jsonb,
  helper_health jsonb,
  kiosk_type text default 'bus_boarding',
  label text,
  last_seen timestamptz,
  paired boolean default false,
  pairing_code text,
  status text default 'active',
  vehicle_id text,
  vehicle_name text,
  pairing_expires_at timestamptz,
  network_command jsonb,
  network_status jsonb
);
create or replace trigger kiosk_device_touch before update on public.kiosk_device for each row execute function public.touch_updated_date();
alter table public.kiosk_device add constraint kiosk_device_kiosk_type_allowed check (kiosk_type is null or kiosk_type in ('bus_boarding', 'front_desk', 'badge_registry', 'driver', 'job_signing')) not valid;
alter table public.kiosk_device add constraint kiosk_device_status_allowed check (status is null or status in ('active', 'revoked')) not valid;
alter table public.kiosk_device add constraint kiosk_device_label_required check (label is not null) not valid;
alter table public.kiosk_device add constraint kiosk_device_kiosk_type_required check (kiosk_type is not null) not valid;
create index if not exists kiosk_device_company_id_idx on public.kiosk_device (company_id);
create index if not exists kiosk_device_vehicle_id_idx on public.kiosk_device (vehicle_id);
create index if not exists kiosk_device_created_date_idx on public.kiosk_device (created_date desc);

-- LocationPing
create table if not exists public.location_ping (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  company_id text,
  lat double precision,
  lng double precision,
  recorded_at timestamptz,
  speed double precision,
  vehicle_id text
);
create or replace trigger location_ping_touch before update on public.location_ping for each row execute function public.touch_updated_date();
alter table public.location_ping add constraint location_ping_vehicle_id_required check (vehicle_id is not null) not valid;
alter table public.location_ping add constraint location_ping_company_id_required check (company_id is not null) not valid;
alter table public.location_ping add constraint location_ping_lat_required check (lat is not null) not valid;
alter table public.location_ping add constraint location_ping_lng_required check (lng is not null) not valid;
alter table public.location_ping add constraint location_ping_recorded_at_required check (recorded_at is not null) not valid;
create index if not exists location_ping_company_id_idx on public.location_ping (company_id);
create index if not exists location_ping_vehicle_id_idx on public.location_ping (vehicle_id);
create index if not exists location_ping_created_date_idx on public.location_ping (created_date desc);

-- LostItemReport
create table if not exists public.lost_item_report (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  company_id text,
  company_name text,
  reporter_name text,
  reporter_email text,
  contact text,
  vehicle_name text,
  description text,
  status text default 'open',
  admin_notes text,
  reporter_id text
);
create or replace trigger lost_item_report_touch before update on public.lost_item_report for each row execute function public.touch_updated_date();
alter table public.lost_item_report add constraint lost_item_report_status_allowed check (status is null or status in ('open', 'found', 'returned', 'closed')) not valid;
alter table public.lost_item_report add constraint lost_item_report_description_required check (description is not null) not valid;
create index if not exists lost_item_report_company_id_idx on public.lost_item_report (company_id);
create index if not exists lost_item_report_reporter_email_idx on public.lost_item_report (reporter_email);
create index if not exists lost_item_report_reporter_id_idx on public.lost_item_report (reporter_id);
create index if not exists lost_item_report_created_date_idx on public.lost_item_report (created_date desc);

-- MaintenanceSchedule
create table if not exists public.maintenance_schedule (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  vehicle_id text,
  vehicle_name text,
  company_id text,
  company_name text,
  service_type text,
  due_type text default 'mileage',
  interval_km double precision default 0,
  interval_days double precision default 0,
  last_service_mileage double precision default 0,
  last_service_date date,
  status text default 'upcoming',
  assigned_mechanic_id text,
  assigned_mechanic_name text,
  notes text
);
create or replace trigger maintenance_schedule_touch before update on public.maintenance_schedule for each row execute function public.touch_updated_date();
alter table public.maintenance_schedule add constraint maintenance_schedule_due_type_allowed check (due_type is null or due_type in ('mileage', 'days')) not valid;
alter table public.maintenance_schedule add constraint maintenance_schedule_status_allowed check (status is null or status in ('upcoming', 'due', 'overdue', 'completed')) not valid;
alter table public.maintenance_schedule add constraint maintenance_schedule_vehicle_id_required check (vehicle_id is not null) not valid;
alter table public.maintenance_schedule add constraint maintenance_schedule_service_type_required check (service_type is not null) not valid;
alter table public.maintenance_schedule add constraint maintenance_schedule_company_id_required check (company_id is not null) not valid;
create index if not exists maintenance_schedule_vehicle_id_idx on public.maintenance_schedule (vehicle_id);
create index if not exists maintenance_schedule_company_id_idx on public.maintenance_schedule (company_id);
create index if not exists maintenance_schedule_assigned_mechanic_id_idx on public.maintenance_schedule (assigned_mechanic_id);
create index if not exists maintenance_schedule_created_date_idx on public.maintenance_schedule (created_date desc);

-- MaintenanceSettings
create table if not exists public.maintenance_settings (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  auto_create_faults boolean default true,
  maintenance_reminder_days double precision default 14,
  enable_photo_attachments boolean default true,
  inspection_reminder_days double precision default 1
);
create or replace trigger maintenance_settings_touch before update on public.maintenance_settings for each row execute function public.touch_updated_date();
create index if not exists maintenance_settings_created_date_idx on public.maintenance_settings (created_date desc);

-- NfcCard
create table if not exists public.nfc_card (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  card_uid text,
  card_type text,
  holder_type text,
  holder_source text,
  holder_id text,
  holder_name text,
  employee_id text,
  role text,
  assigned_vehicle text,
  company_id text,
  company_name text,
  access_level text,
  issue_date timestamptz,
  expiry_date date,
  issued_by text,
  is_active boolean default true,
  revoked_at timestamptz,
  revoked_by text,
  revoke_reason text
);
create or replace trigger nfc_card_touch before update on public.nfc_card for each row execute function public.touch_updated_date();
alter table public.nfc_card add constraint nfc_card_holder_type_allowed check (holder_type is null or holder_type in ('driver', 'mechanic', 'staff', 'other')) not valid;
alter table public.nfc_card add constraint nfc_card_holder_source_allowed check (holder_source is null or holder_source in ('driver', 'user', 'contact', 'cardholder')) not valid;
alter table public.nfc_card add constraint nfc_card_card_uid_required check (card_uid is not null) not valid;
alter table public.nfc_card add constraint nfc_card_holder_name_required check (holder_name is not null) not valid;
create index if not exists nfc_card_holder_id_idx on public.nfc_card (holder_id);
create index if not exists nfc_card_employee_id_idx on public.nfc_card (employee_id);
create index if not exists nfc_card_company_id_idx on public.nfc_card (company_id);
create index if not exists nfc_card_created_date_idx on public.nfc_card (created_date desc);

-- NotificationLog -- One email or phone alert the app sent (or held back), for Admin → Notifications → Recent.
create table if not exists public.notification_log (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  key text,
  channel text,
  title text,
  recipients jsonb,
  recipient_count double precision,
  sent double precision,
  failed double precision,
  skipped double precision,
  status text,
  error text,
  company_id text,
  sent_at timestamptz
);
create or replace trigger notification_log_touch before update on public.notification_log for each row execute function public.touch_updated_date();
alter table public.notification_log add constraint notification_log_channel_allowed check (channel is null or channel in ('email', 'push')) not valid;
alter table public.notification_log add constraint notification_log_status_allowed check (status is null or status in ('sent', 'partial', 'failed', 'held', 'off')) not valid;
alter table public.notification_log add constraint notification_log_key_required check (key is not null) not valid;
alter table public.notification_log add constraint notification_log_channel_required check (channel is not null) not valid;
create index if not exists notification_log_company_id_idx on public.notification_log (company_id);
create index if not exists notification_log_created_date_idx on public.notification_log (created_date desc);

-- NotificationSetting -- Admin choices for one kind of notification (Admin → Notifications): whether it is sent at all, and the people who should not get it. A kind with no row is on for everyone who would normally get it.
create table if not exists public.notification_setting (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  key text,
  enabled boolean default true,
  blocked_emails jsonb,
  blocked_company_ids jsonb,
  updated_by text
);
create or replace trigger notification_setting_touch before update on public.notification_setting for each row execute function public.touch_updated_date();
alter table public.notification_setting add constraint notification_setting_key_required check (key is not null) not valid;
create index if not exists notification_setting_created_date_idx on public.notification_setting (created_date desc);

-- Part
create table if not exists public.part (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  company_id text,
  company_name text,
  part_name text,
  oem_number text,
  aftermarket_number text,
  vehicle_compatibility text,
  category text,
  quantity_in_stock double precision default 0,
  unit_price double precision default 0,
  supplier text,
  photo_url text
);
create or replace trigger part_touch before update on public.part for each row execute function public.touch_updated_date();
alter table public.part add constraint part_part_name_required check (part_name is not null) not valid;
create index if not exists part_company_id_idx on public.part (company_id);
create index if not exists part_created_date_idx on public.part (created_date desc);

-- PassengerAccessCredential
create table if not exists public.passenger_access_credential (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  user_id text,
  company_id text,
  token_hash text,
  contact_id text,
  issued_at timestamptz,
  qr_token text,
  qr_hash text,
  qr_issued_at timestamptz
);
create or replace trigger passenger_access_credential_touch before update on public.passenger_access_credential for each row execute function public.touch_updated_date();
alter table public.passenger_access_credential add constraint passenger_access_credential_company_id_required check (company_id is not null) not valid;
alter table public.passenger_access_credential add constraint passenger_access_credential_token_hash_required check (token_hash is not null) not valid;
create index if not exists passenger_access_credential_user_id_idx on public.passenger_access_credential (user_id);
create index if not exists passenger_access_credential_company_id_idx on public.passenger_access_credential (company_id);
create index if not exists passenger_access_credential_contact_id_idx on public.passenger_access_credential (contact_id);
create index if not exists passenger_access_credential_created_date_idx on public.passenger_access_credential (created_date desc);

-- PassengerOneTimeCredential
create table if not exists public.passenger_one_time_credential (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  user_id text,
  company_id text,
  token_hash text,
  expires_at text,
  consumed_at text
);
create or replace trigger passenger_one_time_credential_touch before update on public.passenger_one_time_credential for each row execute function public.touch_updated_date();
create index if not exists passenger_one_time_credential_user_id_idx on public.passenger_one_time_credential (user_id);
create index if not exists passenger_one_time_credential_company_id_idx on public.passenger_one_time_credential (company_id);
create index if not exists passenger_one_time_credential_created_date_idx on public.passenger_one_time_credential (created_date desc);

-- PhoneUnlock -- A short-lived code a driver tablet shows so a driver can start the shift and unlock it from the driver phone app. Server-only; never readable from the app.
create table if not exists public.phone_unlock (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  device_id text,
  vehicle_id text,
  company_id text,
  code_hash text,
  expires_at timestamptz,
  status text default 'pending',
  driver_id text,
  driver_email text,
  driver_name text,
  claimed_at timestamptz,
  delivered_at timestamptz,
  shift_id text
);
create or replace trigger phone_unlock_touch before update on public.phone_unlock for each row execute function public.touch_updated_date();
alter table public.phone_unlock add constraint phone_unlock_status_allowed check (status is null or status in ('pending', 'claimed', 'delivered')) not valid;
alter table public.phone_unlock add constraint phone_unlock_device_id_required check (device_id is not null) not valid;
alter table public.phone_unlock add constraint phone_unlock_vehicle_id_required check (vehicle_id is not null) not valid;
alter table public.phone_unlock add constraint phone_unlock_company_id_required check (company_id is not null) not valid;
alter table public.phone_unlock add constraint phone_unlock_code_hash_required check (code_hash is not null) not valid;
alter table public.phone_unlock add constraint phone_unlock_expires_at_required check (expires_at is not null) not valid;
create index if not exists phone_unlock_device_id_idx on public.phone_unlock (device_id);
create index if not exists phone_unlock_vehicle_id_idx on public.phone_unlock (vehicle_id);
create index if not exists phone_unlock_company_id_idx on public.phone_unlock (company_id);
create index if not exists phone_unlock_driver_id_idx on public.phone_unlock (driver_id);
create index if not exists phone_unlock_driver_email_idx on public.phone_unlock (driver_email);
create index if not exists phone_unlock_shift_id_idx on public.phone_unlock (shift_id);
create index if not exists phone_unlock_created_date_idx on public.phone_unlock (created_date desc);

-- Place
create table if not exists public.place (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  company_id text,
  name text,
  kind text default 'other',
  address text,
  lat double precision,
  lng double precision,
  notes text
);
create or replace trigger place_touch before update on public.place for each row execute function public.touch_updated_date();
alter table public.place add constraint place_kind_allowed check (kind is null or kind in ('airport', 'hotel', 'attraction', 'other')) not valid;
alter table public.place add constraint place_name_required check (name is not null) not valid;
create index if not exists place_company_id_idx on public.place (company_id);
create index if not exists place_created_date_idx on public.place (created_date desc);

-- PushToken
create table if not exists public.push_token (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  token text,
  email text,
  device_id text,
  role text,
  company_id text
);
create or replace trigger push_token_touch before update on public.push_token for each row execute function public.touch_updated_date();
alter table public.push_token add constraint push_token_token_required check (token is not null) not valid;
create index if not exists push_token_email_idx on public.push_token (email);
create index if not exists push_token_device_id_idx on public.push_token (device_id);
create index if not exists push_token_company_id_idx on public.push_token (company_id);
create index if not exists push_token_created_date_idx on public.push_token (created_date desc);

-- Route
create table if not exists public.route (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  company_id text,
  company_name text,
  name text,
  "type" text default 'staff',
  stops jsonb,
  active boolean default true,
  path jsonb,
  pickup_merge_m double precision,
  path_via jsonb
);
create or replace trigger route_touch before update on public.route for each row execute function public.touch_updated_date();
alter table public.route add constraint route_type_allowed check ("type" is null or "type" in ('staff', 'airport')) not valid;
alter table public.route add constraint route_name_required check (name is not null) not valid;
alter table public.route add constraint route_company_id_required check (company_id is not null) not valid;
create index if not exists route_company_id_idx on public.route (company_id);
create index if not exists route_created_date_idx on public.route (created_date desc);

-- RouteTravelTimes
create table if not exists public.route_travel_times (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  route_id text,
  route_name text,
  company_id text,
  legs jsonb,
  dwells jsonb,
  leg_samples double precision,
  pings_used double precision,
  vehicles_used double precision,
  days double precision,
  learned_at timestamptz
);
create or replace trigger route_travel_times_touch before update on public.route_travel_times for each row execute function public.touch_updated_date();
alter table public.route_travel_times add constraint route_travel_times_route_id_required check (route_id is not null) not valid;
create index if not exists route_travel_times_route_id_idx on public.route_travel_times (route_id);
create index if not exists route_travel_times_company_id_idx on public.route_travel_times (company_id);
create index if not exists route_travel_times_created_date_idx on public.route_travel_times (created_date desc);

-- SignupAlert -- Server-only delivery ledger for new-account admin alerts.
create table if not exists public.signup_alert (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  user_id text,
  completed boolean,
  delivered_emails jsonb,
  notified_at timestamptz
);
create or replace trigger signup_alert_touch before update on public.signup_alert for each row execute function public.touch_updated_date();
alter table public.signup_alert add constraint signup_alert_user_id_required check (user_id is not null) not valid;
create index if not exists signup_alert_user_id_idx on public.signup_alert (user_id);
create index if not exists signup_alert_created_date_idx on public.signup_alert (created_date desc);

-- StaffCheckIn
create table if not exists public.staff_check_in (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  staff_name text,
  staff_picture_url text,
  card_tag text,
  status text default 'boarded',
  boarded_at timestamptz,
  company_id text,
  company_name text,
  vehicle_id text,
  vehicle_name text,
  check_in_method text default 'manual',
  client_request_id text,
  request_hash text,
  boarding_grant_hash text,
  device_id text
);
create or replace trigger staff_check_in_touch before update on public.staff_check_in for each row execute function public.touch_updated_date();
alter table public.staff_check_in add constraint staff_check_in_status_allowed check (status is null or status in ('boarded', 'off_board')) not valid;
alter table public.staff_check_in add constraint staff_check_in_check_in_method_allowed check (check_in_method is null or check_in_method in ('nfc', 'qr', 'manual', 'code', 'bluetooth')) not valid;
alter table public.staff_check_in add constraint staff_check_in_card_tag_required check (card_tag is not null) not valid;
alter table public.staff_check_in add constraint staff_check_in_status_required check (status is not null) not valid;
create index if not exists staff_check_in_company_id_idx on public.staff_check_in (company_id);
create index if not exists staff_check_in_vehicle_id_idx on public.staff_check_in (vehicle_id);
create index if not exists staff_check_in_client_request_id_idx on public.staff_check_in (client_request_id);
create index if not exists staff_check_in_device_id_idx on public.staff_check_in (device_id);
create index if not exists staff_check_in_created_date_idx on public.staff_check_in (created_date desc);

-- Trip
create table if not exists public.trip (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  vehicle_id text,
  vehicle_name text,
  plate_number text,
  route_id text,
  route_name text,
  company_id text,
  company_name text,
  driver_email text,
  driver_name text,
  passenger_name text,
  passenger_phone text,
  pickup_name text,
  pickup_lat double precision,
  pickup_lng double precision,
  dropoff_name text,
  dropoff_lat double precision,
  dropoff_lng double precision,
  scheduled_time timestamptz,
  status text default 'scheduled',
  started_at timestamptz,
  arrived_at timestamptz,
  completed_at timestamptz,
  pickup_signature_url text,
  pickup_signed_by text,
  pickup_signed_at timestamptz,
  dropoff_signature_url text,
  dropoff_signed_by text,
  dropoff_signed_at timestamptz,
  job_type text,
  client_id text,
  client_name text,
  pickup_address text,
  dropoff_address text,
  flight_number text,
  flight_time timestamptz,
  guests bigint,
  luggage bigint,
  notes text,
  stops jsonb,
  end_time timestamptz,
  price double precision,
  currency text default 'XCD',
  invoice_id text,
  invoice_number text,
  cancelled_at timestamptz,
  pickup_signature_uri text,
  pickup_signed_guests bigint,
  pickup_signed_lat double precision,
  pickup_signed_lng double precision,
  pickup_signature_request_id text,
  dropoff_signature_uri text,
  dropoff_signed_guests bigint,
  dropoff_signed_lat double precision,
  dropoff_signed_lng double precision,
  dropoff_signature_request_id text,
  pickup_signed_role text,
  dropoff_signed_role text
);
create or replace trigger trip_touch before update on public.trip for each row execute function public.touch_updated_date();
alter table public.trip add constraint trip_status_allowed check (status is null or status in ('scheduled', 'on_the_way', 'arrived', 'completed', 'cancelled')) not valid;
alter table public.trip add constraint trip_job_type_allowed check (job_type is null or job_type in ('airport_pickup', 'airport_dropoff', 'hotel_tour', 'staff_run', 'transfer')) not valid;
alter table public.trip add constraint trip_pickup_signed_role_allowed check (pickup_signed_role is null or pickup_signed_role in ('guest', 'reception')) not valid;
alter table public.trip add constraint trip_dropoff_signed_role_allowed check (dropoff_signed_role is null or dropoff_signed_role in ('guest', 'reception')) not valid;
alter table public.trip add constraint trip_company_id_required check (company_id is not null) not valid;
create index if not exists trip_vehicle_id_idx on public.trip (vehicle_id);
create index if not exists trip_route_id_idx on public.trip (route_id);
create index if not exists trip_company_id_idx on public.trip (company_id);
create index if not exists trip_driver_email_idx on public.trip (driver_email);
create index if not exists trip_client_id_idx on public.trip (client_id);
create index if not exists trip_invoice_id_idx on public.trip (invoice_id);
create index if not exists trip_pickup_signature_request_id_idx on public.trip (pickup_signature_request_id);
create index if not exists trip_dropoff_signature_request_id_idx on public.trip (dropoff_signature_request_id);
create index if not exists trip_created_date_idx on public.trip (created_date desc);

-- User
create table if not exists public.app_user (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  email text,
  full_name text,
  role text,
  disabled boolean,
  auth_user_id uuid unique,
  company_id text,
  display_name text,
  phone text,
  photo_url text,
  home_lat double precision,
  home_lng double precision,
  home_address text,
  work_lat double precision,
  work_lng double precision,
  nfc_tag_id text,
  access_code text,
  one_time_code text,
  one_time_code_expires_at timestamptz,
  whatsapp_linked boolean default false,
  skip_pickup_today boolean default false,
  skip_pickup_until timestamptz,
  late_snooze_active boolean default false,
  late_until timestamptz,
  favorite_stop text,
  stop_alerts boolean default false,
  notification_opt_out jsonb,
  theme_accent text,
  employee_id text,
  pickup_lat double precision,
  pickup_lng double precision,
  pickup_name text,
  pickup_route_id text,
  pickup_moved jsonb
);
create or replace trigger app_user_touch before update on public.app_user for each row execute function public.touch_updated_date();
create index if not exists app_user_company_id_idx on public.app_user (company_id);
create index if not exists app_user_nfc_tag_id_idx on public.app_user (nfc_tag_id);
create index if not exists app_user_employee_id_idx on public.app_user (employee_id);
create index if not exists app_user_pickup_route_id_idx on public.app_user (pickup_route_id);
create index if not exists app_user_email_idx on public.app_user (email);
create index if not exists app_user_created_date_idx on public.app_user (created_date desc);

-- Vehicle
create table if not exists public.vehicle (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  capacity double precision,
  company_id text,
  company_name text,
  current_lat double precision,
  current_lng double precision,
  current_odometer double precision,
  driver_email text,
  driver_name text,
  driver_pin text,
  entry_code text,
  heading double precision,
  image_url text,
  last_location_update timestamptz,
  last_ping_logged_at timestamptz,
  name text,
  near_stop_id text,
  road_next_stop double precision,
  plate_number text,
  remote_tracking_lock boolean default false,
  route_id text,
  speed double precision,
  status text default 'offline',
  tracking_active boolean default false,
  trail jsonb,
  "type" text default 'bus',
  backup_gps_driver_email text,
  backup_gps_since timestamptz,
  wired_gps_connected boolean default false,
  fleet_number text,
  make text,
  model text,
  year bigint,
  vin text,
  engine text,
  transmission text,
  hours double precision default 0,
  fuel_type text,
  last_inspection_date date,
  in_service boolean default true,
  model_3d text,
  trip_direction text default 'to_work',
  trip_direction_started_at text,
  return_pickup_state text,
  return_pickup_date text
);
create or replace trigger vehicle_touch before update on public.vehicle for each row execute function public.touch_updated_date();
alter table public.vehicle add constraint vehicle_status_allowed check (status is null or status in ('offline', 'idle', 'on_trip', 'speeding', 'emergency')) not valid;
alter table public.vehicle add constraint vehicle_type_allowed check ("type" is null or "type" in ('bus', 'taxi')) not valid;
alter table public.vehicle add constraint vehicle_trip_direction_allowed check (trip_direction is null or trip_direction in ('to_work', 'to_home')) not valid;
alter table public.vehicle add constraint vehicle_return_pickup_state_allowed check (return_pickup_state is null or return_pickup_state in ('pending', 'near', 'arrived', 'departed')) not valid;
alter table public.vehicle add constraint vehicle_name_required check (name is not null) not valid;
alter table public.vehicle add constraint vehicle_type_required check ("type" is not null) not valid;
alter table public.vehicle add constraint vehicle_company_id_required check (company_id is not null) not valid;
create index if not exists vehicle_company_id_idx on public.vehicle (company_id);
create index if not exists vehicle_driver_email_idx on public.vehicle (driver_email);
create index if not exists vehicle_near_stop_id_idx on public.vehicle (near_stop_id);
create index if not exists vehicle_route_id_idx on public.vehicle (route_id);
create index if not exists vehicle_backup_gps_driver_email_idx on public.vehicle (backup_gps_driver_email);
create index if not exists vehicle_created_date_idx on public.vehicle (created_date desc);

-- VerificationAttempt
create table if not exists public.verification_attempt (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  scope text,
  attempted_at text
);
create or replace trigger verification_attempt_touch before update on public.verification_attempt for each row execute function public.touch_updated_date();
create index if not exists verification_attempt_created_date_idx on public.verification_attempt (created_date desc);

-- VerificationGrant
create table if not exists public.verification_grant (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  token_hash text,
  device_id text,
  company_id text,
  vehicle_id text,
  purpose text,
  subject text,
  expires_at text,
  pairing_code_hash text,
  credential_version text,
  auth_kind text,
  subject_source text,
  member_user_id text,
  card_id text,
  card_tag_hash text
);
create or replace trigger verification_grant_touch before update on public.verification_grant for each row execute function public.touch_updated_date();
create index if not exists verification_grant_device_id_idx on public.verification_grant (device_id);
create index if not exists verification_grant_company_id_idx on public.verification_grant (company_id);
create index if not exists verification_grant_vehicle_id_idx on public.verification_grant (vehicle_id);
create index if not exists verification_grant_member_user_id_idx on public.verification_grant (member_user_id);
create index if not exists verification_grant_card_id_idx on public.verification_grant (card_id);
create index if not exists verification_grant_created_date_idx on public.verification_grant (created_date desc);

-- Workplace
create table if not exists public.workplace (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  name text,
  company_id text,
  company_name text,
  lat double precision,
  lng double precision
);
create or replace trigger workplace_touch before update on public.workplace for each row execute function public.touch_updated_date();
alter table public.workplace add constraint workplace_name_required check (name is not null) not valid;
create index if not exists workplace_company_id_idx on public.workplace (company_id);
create index if not exists workplace_created_date_idx on public.workplace (created_date desc);

-- Busy lookups: GPS history by bus and time, today's check-ins per bus,
-- a passenger's memberships, push tokens by owner.
create index if not exists location_ping_vehicle_time_idx on public.location_ping (vehicle_id, recorded_at desc);
create index if not exists staff_check_in_vehicle_time_idx on public.staff_check_in (vehicle_id, created_date desc);
create index if not exists company_membership_company_scope_idx on public.company_membership (company_id, scope, active);
create index if not exists push_token_token_idx on public.push_token (token);

