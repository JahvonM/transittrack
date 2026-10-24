-- No application data is changed by this migration. Cleanup runs only when
-- an authenticated administrator invokes the service-only RPC.
create or replace function public.tt_company_assignment_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  -- Historical rows may retain a removed company's id. New/reassigned rows
  -- must reference a live company; lock it against a concurrent deletion.
  if nullif(new.company_id, '') is not null and
     (tg_op = 'INSERT' or new.company_id is distinct from old.company_id) then
    perform 1 from public.company where id = new.company_id for key share;
    if not found then raise exception 'Company not found' using errcode = '23503'; end if;
  end if;
  return new;
end $$;

-- All company-bearing tables, including credentials and memberships, share
-- the guard. Existing orphan rows remain readable and recoverable.
do $$ declare t record; begin
  for t in select table_name from information_schema.columns
    where table_schema='public' and column_name='company_id'
  loop
    execute format('create or replace trigger tt_company_assignment before insert or update of company_id on public.%I for each row execute function public.tt_company_assignment_guard()',t.table_name);
  end loop;
end $$;

create or replace function public.tt_company_delete_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('tt.company_cleanup', true),'') <> old.id then
    raise exception 'Use company lifecycle RPC' using errcode='42501';
  end if;
  return old;
end $$;
create or replace trigger tt_company_delete before delete on public.company
for each row execute function public.tt_company_delete_guard();

create or replace function public.tt_company_lifecycle(p_actor_id text, p_company_id text, p_action text default 'delete')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor public.app_user%rowtype;
  vehicles text[]; devices text[]; people text[];
  counts jsonb; n_vehicle integer; n_route integer; n_driver integer;
  existed boolean; t record;
begin
  if p_action not in ('delete','recover') or p_action is null or
     p_company_id is null or p_company_id !~ '^[A-Za-z0-9_-]{1,128}$' then
    raise exception 'Invalid cleanup request' using errcode='22023';
  end if;
  -- Serializes cleanup and all writes to affected tables, in a stable order.
  -- Short lock timeout fails the whole transaction rather than blocking fleet
  -- traffic indefinitely. Assignment guards reject stale writes after commit.
  perform set_config('lock_timeout','5s',true);
  lock table public.company in share row exclusive mode;
  for t in select distinct table_name from information_schema.columns
    where table_schema='public' and (column_name='company_id' or table_name in ('role_assignment','audit_log'))
    order by table_name
  loop execute format('lock table public.%I in share row exclusive mode',t.table_name); end loop;
  select * into actor from public.app_user where id=p_actor_id;
  if actor.id is null or actor.role is distinct from 'admin' or actor.disabled is true then
    raise exception 'Admin required' using errcode='42501';
  end if;
  select exists(select 1 from public.company where id=p_company_id) into existed;
  if p_action='recover' and existed then raise exception 'Company still exists' using errcode='22023'; end if;
  select coalesce(array_agg(id),'{}') into vehicles from public.vehicle where company_id=p_company_id;
  select coalesce(array_agg(id),'{}') into devices from public.kiosk_device where company_id=p_company_id or vehicle_id=any(vehicles);
  select coalesce(array_agg(distinct u.id),'{}') into people from public.app_user u
    where u.company_id=p_company_id or exists(select 1 from public.company_membership m where m.user_id=u.id and m.company_id=p_company_id);

  update public.company_membership set active=false where company_id=p_company_id;
  delete from public.company_access_grant where company_id=p_company_id;
  delete from public.device_credential where company_id=p_company_id or device_id=any(devices) or vehicle_id=any(vehicles);
  delete from public.verification_grant where company_id=p_company_id or device_id=any(devices) or vehicle_id=any(vehicles);
  update public.driver_pin_credential set enabled=false, pin_hash=null, salt=null
    where company_id=p_company_id or vehicle_id=any(vehicles);
  update public.kiosk_device set status='revoked', paired=false, pairing_code=null, pairing_expires_at=null,
    company_id=null, company_name='', vehicle_id=null, vehicle_name='' where id=any(devices);
  update public.nfc_card set is_active=false, revoked_at=now(), revoked_by=actor.email,
    revoke_reason='Company removed' where company_id=p_company_id;
  update public.contact set company_id=null, company_name='', vehicle_id=null, vehicle_name='',
    access_code=null, nfc_card_tag=null where company_id=p_company_id;
  update public.card_holder set company_id=null, company_name='', assigned_vehicle=null where company_id=p_company_id;
  -- Custom roles are global in this schema, not company-scoped. Remove them
  -- from departing company staff so the global workspace cannot expose history.
  -- Platform administrators/mechanics retain their explicitly global access.
  delete from public.role_assignment where user_id in
    (select id from public.app_user where id=any(people) and role not in ('admin','mechanic'));
  update public.app_user set access_role_id=null where id=any(people) and role not in ('admin','mechanic');
  update public.app_user set company_id=null, access_code=null, one_time_code=null,
    one_time_code_expires_at=null, nfc_tag_id=null, pickup_route_id=null,
    role=case when role in ('company','driver') then 'staff' else role end where company_id=p_company_id;
  delete from public.push_token where company_id=p_company_id;
  update public.tablet_support_session set state='ended', ended_at=now()::text, offer_sdp=null, answer_sdp=null where company_id=p_company_id or device_id=any(devices);
  update public.tablet_recording_session set state='ended', ended_at=now()::text where company_id=p_company_id or device_id=any(devices);
  update public.driver_shift set ended_at=now() where company_id=p_company_id and ended_at is null;
  update public.advertisement set active=false where company_id=p_company_id;
  -- Preserve company ids on trips, inspections, invoices, messages, and audit
  -- history. They must never become records of a newly assigned company.
  update public.vehicle set company_id=null, company_name='', route_id=null,
    driver_email=null, driver_name='', driver_pin=null, entry_code=null,
    backup_gps_driver_email=null, tracking_active=false, status='offline', current_lat=null, current_lng=null,
    trail=null where company_id=p_company_id;
  get diagnostics n_vehicle=row_count;
  update public.route set company_id=null, company_name='', active=false where company_id=p_company_id;
  get diagnostics n_route=row_count;
  update public.driver set company_id=null, company_name='', nfc_card_uid=null where company_id=p_company_id;
  get diagnostics n_driver=row_count;
  counts=jsonb_build_object('Vehicle',n_vehicle,'Route',n_route,'Driver',n_driver);
  perform set_config('tt.company_cleanup',p_company_id,true);
  delete from public.company where id=p_company_id;
  insert into public.audit_log(actor_email,actor_name,actor_role,action,entity,record_id,summary,changes,status)
    values(actor.email,actor.full_name,'admin',case when existed then 'delete' else 'update' end,'Company',p_company_id,
      case when existed then 'Company removed; assets retained and access revoked' else 'Orphan recovery completed' end,counts::text,'SUCCESS');
  return jsonb_build_object('ok',true,'company_id',p_company_id,'recovered',not existed,'detached',counts);
end $$;
revoke all on function public.tt_company_lifecycle(text,text,text) from public, anon, authenticated;
grant execute on function public.tt_company_lifecycle(text,text,text) to service_role;
