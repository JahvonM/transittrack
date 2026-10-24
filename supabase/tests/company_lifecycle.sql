-- Isolated database acceptance. Fixtures and all mutations are rolled back.
begin;
insert into public.company(id,name) values ('test-co','Company A'),('other-co','Company B');
insert into public.app_user(id,role,email,full_name,company_id,access_role_id) values
 ('test-admin','admin','admin@test.invalid','Admin',null,null),
 ('test-staff','company','staff@test.invalid','Staff','test-co','role');
insert into public.role_assignment(user_id,role_id) values ('test-staff','role');
insert into public.vehicle(id,name,type,company_id,driver_pin,entry_code) values ('test-bus','Bus','bus','test-co','1234','CODE');
insert into public.route(id,name,type,company_id,active) values ('test-route','Route','staff','test-co',true);
insert into public.driver(id,full_name,company_id) values ('test-driver','Driver','test-co');
insert into public.company_membership(user_id,company_id,scope,active) values ('test-staff','test-co','manager',true);
insert into public.kiosk_device(id,label,kiosk_type,company_id,vehicle_id,status,paired) values ('test-device','Tablet','driver','test-co','test-bus','active',true);
insert into public.device_credential(device_id,token_hash,issued_at,expires_at,company_id,vehicle_id) values ('test-device','hash','2026-01-01','2030-01-01','test-co','test-bus');
insert into public.verification_grant(company_id,device_id,vehicle_id,token_hash) values ('test-co','test-device','test-bus','hash');
insert into public.company_access_grant(user_id,company_id,token_hash) values ('test-staff','test-co','hash');
insert into public.driver_pin_credential(company_id,vehicle_id,enabled,pin_hash,salt) values ('test-co','test-bus',true,'hash','salt');
insert into public.passenger_access_credential(company_id,token_hash,user_id) values ('test-co','hash','test-staff');
insert into public.passenger_one_time_credential(company_id,token_hash,user_id) values ('test-co','hash','test-staff');
insert into public.phone_unlock(company_id,device_id,vehicle_id,code_hash,expires_at) values ('test-co','test-device','test-bus','hash','2030-01-01');
insert into public.contact(id,name,type,company_id,access_code,nfc_card_tag) values ('test-contact','Rider','staff','test-co','1234','card');
insert into public.trip(id,vehicle_id,company_id) values ('test-history','test-bus','test-co');

-- Browser roles cannot invoke the RPC even with a known administrator id.
do $$ begin
 if has_function_privilege('anon','public.tt_company_lifecycle(text,text,text)','EXECUTE') or
    has_function_privilege('authenticated','public.tt_company_lifecycle(text,text,text)','EXECUTE') then
   raise exception 'RPC is public'; end if;
 begin perform public.tt_company_lifecycle('test-staff','test-co','delete'); raise exception 'Unauthorized deletion accepted';
 exception when insufficient_privilege then null; end;
 begin delete from public.company where id='test-co'; raise exception 'Direct deletion accepted';
 exception when insufficient_privilege then null; end;
 begin perform public.tt_company_lifecycle('test-admin','test-co','recover'); raise exception 'Live company recovery accepted';
 exception when invalid_parameter_value then null; end;
end $$;

-- A late failure, after revocation/detachment, must restore all earlier writes.
create function public.tt_test_fail_audit() returns trigger language plpgsql as $$ begin raise exception 'injected audit failure'; end $$;
create trigger tt_test_fail before insert on public.audit_log for each row execute function public.tt_test_fail_audit();
do $$ begin
 begin perform public.tt_company_lifecycle('test-admin','test-co','delete'); raise exception 'Failure injection did not run';
 exception when raise_exception then if sqlerrm <> 'injected audit failure' then raise; end if; end;
 if not exists(select 1 from public.company where id='test-co') or
    not exists(select 1 from public.vehicle where id='test-bus' and company_id='test-co') or
    not exists(select 1 from public.device_credential where device_id='test-device') or
    not exists(select 1 from public.company_membership where company_id='test-co' and active) then
   raise exception 'Partial cleanup committed'; end if;
end $$;
drop trigger tt_test_fail on public.audit_log;
drop function public.tt_test_fail_audit();
select public.tt_company_lifecycle('test-admin','test-co','delete');
do $$ begin
 if exists(select 1 from public.company where id='test-co') then raise exception 'Company retained'; end if;
 if not exists(select 1 from public.company where id='other-co') then raise exception 'Other company changed'; end if;
 if not exists(select 1 from public.vehicle where id='test-bus' and company_id is null and driver_pin is null and tracking_active=false) then raise exception 'Vehicle not retained safely'; end if;
 if not exists(select 1 from public.route where id='test-route' and company_id is null and active=false) then raise exception 'Route not retained'; end if;
 if not exists(select 1 from public.driver where id='test-driver' and company_id is null) then raise exception 'Driver not retained'; end if;
 if exists(select 1 from public.company_membership where company_id='test-co' and active) or
    exists(select 1 from public.device_credential where device_id='test-device') or
    exists(select 1 from public.verification_grant where device_id='test-device') or
    exists(select 1 from public.company_access_grant where company_id='test-co') or
    exists(select 1 from public.passenger_access_credential where company_id='test-co') or
    exists(select 1 from public.passenger_one_time_credential where company_id='test-co') or
    exists(select 1 from public.phone_unlock where company_id='test-co') or
    exists(select 1 from public.role_assignment where user_id='test-staff') then raise exception 'Access survived'; end if;
 if not exists(select 1 from public.kiosk_device where id='test-device' and status='revoked' and paired=false) then raise exception 'Device still paired'; end if;
 if not exists(select 1 from public.contact where id='test-contact' and company_id is null and access_code is null and nfc_card_tag is null) then raise exception 'Contact credential survived'; end if;
 if not exists(select 1 from public.trip where id='test-history' and company_id='test-co') then raise exception 'History changed'; end if;
 if not exists(select 1 from public.audit_log where record_id='test-co' and action='delete') then raise exception 'Audit missing'; end if;
 -- A stale concurrent writer cannot reattach records after deletion commits.
 begin update public.vehicle set company_id='test-co' where id='test-bus'; raise exception 'Stale assignment accepted';
 exception when foreign_key_violation then null; end;
end $$;
select public.tt_company_lifecycle('test-admin','test-co','delete');
update public.vehicle set company_id='other-co' where id='test-bus';
-- Model legacy orphan data inserted before the guard existed.
alter table public.driver disable trigger tt_company_assignment;
insert into public.driver(id,full_name,company_id) values ('legacy-driver','Legacy','removed-before-migration');
alter table public.driver enable trigger tt_company_assignment;
select public.tt_company_lifecycle('test-admin','removed-before-migration','recover');
do $$ begin
 if not exists(select 1 from public.driver where id='legacy-driver' and company_id is null) then raise exception 'Orphan recovery failed'; end if;
 if not exists(select 1 from public.vehicle where id='test-bus' and company_id='other-co') then raise exception 'Reassigned asset changed'; end if;
end $$;
rollback;
