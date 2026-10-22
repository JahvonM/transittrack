-- Run after migrations. Exercises UPDATE RETURNING, as the app's REST client does.
-- No real application rows are touched; all test objects are rolled back.
begin;
create temporary table tt_update_contract (id text primary key, status text, updated_date timestamptz);
create trigger tt_update_contract_touch before update on tt_update_contract
for each row execute function public.touch_updated_date();
insert into tt_update_contract values ('device', 'registered', '2000-01-01T00:00:00Z');
do $$
declare matched integer; changed timestamptz;
begin
  with saved as (update tt_update_contract set status='registered' where id='device' returning *)
  select count(*) into matched from saved;
  if matched<>1 then raise exception 'unchanged refresh did not acknowledge the existing device'; end if;
  select updated_date into changed from tt_update_contract where id='device';
  if changed<>'2000-01-01T00:00:00Z'::timestamptz then raise exception 'unchanged refresh altered its timestamp'; end if;
  update tt_update_contract set status='refreshed' where id='device' returning updated_date into changed;
  if changed<>now() then raise exception 'changed row was not timestamped'; end if;
  update tt_update_contract set status='copied', updated_date='2001-01-01T00:00:00Z' where id='device' returning updated_date into changed;
  if changed<>'2001-01-01T00:00:00Z'::timestamptz then raise exception 'explicit copied timestamp was lost'; end if;
  with saved as (update tt_update_contract set status='registered' where id='missing' returning *)
  select count(*) into matched from saved;
  if matched<>0 then raise exception 'missing record was falsely acknowledged'; end if;
end $$;
rollback;
