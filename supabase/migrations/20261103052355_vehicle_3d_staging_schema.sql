-- Additive staging migration; no existing tables are changed.
-- Company membership (text user_id) is resolved through app_user.auth_user_id.
-- Photos are private and constrained to one scan per storage prefix.
create table if not exists public.vehicle_3d_scan (
  id uuid primary key default gen_random_uuid(),
  vehicle_id text not null references public.vehicle(id) on delete cascade,
  company_id text not null references public.company(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  status text not null default 'draft' check (status in ('draft','capturing','uploading','queued','processing','ready','failed','cancelled')),
  photo_count integer not null default 0 check (photo_count between 0 and 200),
  error_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,company_id)
);

create table if not exists public.vehicle_3d_photo (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.vehicle_3d_scan(id) on delete cascade,
  object_path text not null unique,
  capture_pass text not null check (capture_pass in ('lower','middle','upper')),
  bytes bigint not null check (bytes > 0 and bytes <= 20971520),
  content_type text not null check (content_type in ('image/jpeg','image/png','image/webp','image/heic','image/heif')),
  created_at timestamptz not null default now(),
  constraint photo_path_scan check (split_part(object_path,'/',1)=scan_id::text),
  constraint photo_path_structure check (object_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|jpeg|png|webp|heic|heif)$')
);

create table if not exists public.vehicle_3d_model (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.vehicle_3d_scan(id) on delete cascade,
  object_path text not null unique,
  file_size bigint not null check(file_size > 0),
  generation_provider text,
  quality_report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.vehicle_3d_job (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.vehicle_3d_scan(id) on delete cascade,
  idempotency_key text not null unique,
  status text not null default 'queued' check (status in ('queued','processing','ready','failed','cancelled')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  provider_job_id text,
  provider_name text,
  estimated_cost_cents integer check (estimated_cost_cents >= 0),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vehicle_3d_scan_company_vehicle_idx on public.vehicle_3d_scan(company_id,vehicle_id,created_at desc);
create index if not exists vehicle_3d_photo_scan_idx on public.vehicle_3d_photo(scan_id);
create index if not exists vehicle_3d_model_scan_idx on public.vehicle_3d_model(scan_id);
create index if not exists vehicle_3d_job_scan_idx on public.vehicle_3d_job(scan_id);

-- Browser clients do not access these tables directly. The existing
-- TransitTrack app uses authenticated Edge Functions for all data access.
-- Enable RLS and grant no direct anon/authenticated access; service_role
-- functions perform explicit company/vehicle authorization for every call.
alter table public.vehicle_3d_scan enable row level security;
alter table public.vehicle_3d_photo enable row level security;
alter table public.vehicle_3d_model enable row level security;
alter table public.vehicle_3d_job enable row level security;

revoke all on public.vehicle_3d_scan,public.vehicle_3d_photo,
  public.vehicle_3d_model,public.vehicle_3d_job from public, anon, authenticated;

-- Create private buckets only. A separate backend service (not the browser)
-- uploads and downloads through short-lived signed URLs with company authorization.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('vehicle-3d-photos','vehicle-3d-photos',false,20971520,array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do nothing;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('vehicle-3d-models','vehicle-3d-models',false,157286400,array['model/gltf-binary','application/octet-stream'])
on conflict (id) do nothing;

-- Deliberately do NOT allow browser storage insert/update/delete here.
-- An authenticated edge function must validate the scan and issue one-file
-- upload URLs; model uploads are restricted to the reconstruction worker.
-- Before deploying, audit every existing storage policy and grants.


-- An explicit server-authorized action enqueues a job through this atomic
-- database function. Never expose it to anonymous/authenticated API roles.
alter table public.vehicle_3d_job
  add constraint vehicle_3d_job_single_scan unique (scan_id);

create or replace function public.vehicle_3d_enqueue_verified(
  p_scan_id uuid,
  p_actor uuid,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scan record;
  v_count integer;
  v_passes integer;
  v_job_id uuid;
begin
  if p_actor is null or length(p_idempotency_key) not between 16 and 128 then
    raise exception 'Invalid reconstruction request';
  end if;

  select s.id, s.company_id, s.created_by, s.status
    into v_scan
    from public.vehicle_3d_scan s
    where s.id = p_scan_id
    for update;
  if not found or v_scan.created_by <> p_actor then
    raise exception 'Scan unavailable';
  end if;
  if v_scan.status not in ('draft','capturing','uploading','queued') then
    raise exception 'Scan cannot be queued';
  end if;

  -- Membership must be checked against the supplied actor rather than
  -- auth.uid(), because this RPC is called with the service role.
  if not exists (
    select 1 from public.app_user u
    join public.company_membership m on m.user_id=u.id
    where u.auth_user_id=p_actor and u.disabled is distinct from true
      and u.role in ('admin','company','mechanic')
      and m.company_id=v_scan.company_id and m.active is true
      and case when m.expires_at is null then true
        when m.expires_at ~ '^[0-9]{4}-[0-9][0-9]-[0-9][0-9]' then m.expires_at::timestamptz > now()
        else false end
  ) then
    raise exception 'Company access denied';
  end if;

  -- Serialize the daily company quota even if multiple vehicles enqueue
  -- simultaneously. This intentionally limits initial GPU processing volume.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_scan.company_id));
  if not exists(select 1 from public.vehicle_3d_job j where j.scan_id=p_scan_id)
     and (
       select count(*) from public.vehicle_3d_job j
       join public.vehicle_3d_scan s on s.id=j.scan_id
       where s.company_id=v_scan.company_id
         and j.created_at >= date_trunc('day', now())
     ) >= 2 then
    raise exception 'Daily company reconstruction quota reached';
  end if;

  select count(*), count(distinct p.capture_pass)
    into v_count, v_passes
    from public.vehicle_3d_photo p
    where p.scan_id=p_scan_id;

  if v_count < 40 or v_count > 200 or v_passes <> 3 then
    raise exception 'Incomplete exterior photo coverage';
  end if;

  insert into public.vehicle_3d_job (scan_id, idempotency_key, status)
    values (p_scan_id, p_idempotency_key, 'queued')
    on conflict (scan_id) do nothing
    returning id into v_job_id;

  if v_job_id is null then
    select id into v_job_id from public.vehicle_3d_job
    where scan_id=p_scan_id;
    if v_job_id is null then raise exception 'Could not queue scan'; end if;
  end if;

  update public.vehicle_3d_scan
    set status='queued', updated_at=now()
    where id=p_scan_id and status in ('draft','capturing','uploading');
  return v_job_id;
end;
$$;

revoke all on function public.vehicle_3d_enqueue_verified(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.vehicle_3d_enqueue_verified(uuid,uuid,text)
  to service_role;
