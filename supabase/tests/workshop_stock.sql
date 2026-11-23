-- Isolated database acceptance for parts used on Workshop jobs: the stock
-- moves in the database as a job's parts are saved. Everything is rolled back.
begin;
create function pg_temp.stock(p text) returns double precision language sql as $$ select quantity_in_stock from public.part where id = p $$;
create function pg_temp.expect(ok boolean, what text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'FAILED: %', what; end if; end $$;
-- Runs one statement that must be refused, and returns its message.
create function pg_temp.refused(statement text, code text) returns text language plpgsql as $$
begin
  execute statement;
  raise exception 'FAILED: accepted %', statement;
exception when others then
  if sqlstate <> code then raise exception 'FAILED: % gave % (%), not %', statement, sqlstate, sqlerrm, code; end if;
  return sqlerrm;
end $$;

-- The server writes with the service key; Supabase's service role skips RLS.
set local role service_role;
insert into public.part(id, part_name, oem_number, quantity_in_stock) values
  ('t-filter', 'Oil filter', '90915-YZZD2', 3), ('t-pads', 'Brake pads', '04465-26420', 1), ('t-gone', 'Old belt', '', 2);
insert into public.workshop_job(id, vehicle_kind, vehicle_id, title) values
  ('t-job', 'bus', 't-bus', 'Service'), ('t-job2', 'car', 't-car', 'Front brakes');

-- Taking from the shelf, and refusing more than the shelf has.
insert into public.workshop_job_part(id, job_id, part_id, part_name, qty) values ('t-1', 't-job', 't-filter', 'Oil filter', 2);
select pg_temp.expect(pg_temp.stock('t-filter') = 1, 'two filters come off the shelf');
select pg_temp.expect(pg_temp.refused($$insert into public.workshop_job_part(job_id, part_id, part_name, qty) values ('t-job', 't-filter', 'Oil filter', 2)$$, 'PT409') = 'Only 1 left on the shelf', 'refuses two more with the count');
select pg_temp.expect(pg_temp.stock('t-filter') = 1 and (select count(*) from public.workshop_job_part where job_id = 't-job') = 1, 'a refused part changes nothing');

-- Changing the amount moves only the difference.
update public.workshop_job_part set qty = 3 where id = 't-1';
select pg_temp.expect(pg_temp.stock('t-filter') = 0, 'one more filter taken');
select pg_temp.expect(pg_temp.refused($$update public.workshop_job_part set qty = 4 where id = 't-1'$$, 'PT409') = 'None left on the shelf', 'refuses a fourth when none are left');
select pg_temp.expect(pg_temp.stock('t-filter') = 0 and (select qty from public.workshop_job_part where id = 't-1') = 3, 'a refused change keeps the old amount and count');
update public.workshop_job_part set qty = 1 where id = 't-1';
select pg_temp.expect(pg_temp.stock('t-filter') = 2, 'two filters go back when the amount drops');

-- Bought for the job: the shelf is left alone, both ways.
update public.workshop_job_part set from_stock = false where id = 't-1';
select pg_temp.expect(pg_temp.stock('t-filter') = 3, 'marking it bought puts it back');
update public.workshop_job_part set from_stock = true where id = 't-1';
select pg_temp.expect(pg_temp.stock('t-filter') = 2, 'marking it from the shelf takes it again');
insert into public.workshop_job_part(id, job_id, part_name, part_number, qty, from_stock) values ('t-2', 't-job', 'Fan belt (NAPA)', '25-060445', 1, false);
select pg_temp.expect(pg_temp.stock('t-filter') = 2 and pg_temp.stock('t-pads') = 1, 'a written-in bought part touches no stock');
select pg_temp.expect(pg_temp.refused($$insert into public.workshop_job_part(job_id, part_name, qty) values ('t-job', 'Mystery part', 1)$$, '23514') like '%shelf_needs_part%', 'a shelf part must be on the parts list');
select pg_temp.expect(pg_temp.refused($$insert into public.workshop_job_part(job_id, part_id, part_name, qty) values ('t-job', 't-filter', 'Oil filter', 0)$$, '23514') like '%qty_positive%', 'nothing used is not a part');

-- Removing a part puts it back; a part since deleted from the list has nowhere to go.
delete from public.workshop_job_part where id = 't-1';
select pg_temp.expect(pg_temp.stock('t-filter') = 3, 'removing the part puts it back');
insert into public.workshop_job_part(id, job_id, part_id, part_name, qty) values ('t-3', 't-job', 't-gone', 'Old belt', 1);
delete from public.part where id = 't-gone';
delete from public.workshop_job_part where id = 't-3';
select pg_temp.expect(pg_temp.refused($$insert into public.workshop_job_part(job_id, part_id, part_name, qty) values ('t-job', 't-gone', 'Old belt', 1)$$, 'PT409') = 'That part is no longer in your parts list', 'a deleted part cannot be taken');

-- Deleting a job puts its shelf parts back.
insert into public.workshop_job_part(job_id, part_id, part_name, qty) values ('t-job2', 't-pads', 'Brake pads', 1), ('t-job2', 't-filter', 'Oil filter', 1);
select pg_temp.expect(pg_temp.stock('t-pads') = 0 and pg_temp.stock('t-filter') = 2, 'the second job takes its parts');
delete from public.workshop_job where id = 't-job2';
select pg_temp.expect(pg_temp.stock('t-pads') = 1 and pg_temp.stock('t-filter') = 3, 'deleting the job puts its parts back');
select pg_temp.expect((select count(*) from public.workshop_job_part where job_id = 't-job2') = 0, 'and removes them');
reset role;

-- The app's own roles reach neither the tables nor the functions.
select pg_temp.expect(not has_function_privilege('anon', 'public.tt_workshop_job_part_stock()', 'EXECUTE') and not has_function_privilege('authenticated', 'public.tt_workshop_job_part_stock()', 'EXECUTE'), 'the stock function is not public');
select pg_temp.expect(not has_function_privilege('anon', 'public.tt_workshop_job_parts_back()', 'EXECUTE') and not has_function_privilege('authenticated', 'public.tt_workshop_job_parts_back()', 'EXECUTE'), 'the job delete function is not public');
set local role authenticated;
select pg_temp.expect((select count(*) from public.workshop_job) = 0 and (select count(*) from public.workshop_job_part) = 0, 'a signed-in browser reads no jobs');
select pg_temp.expect(pg_temp.refused($$insert into public.workshop_job_part(job_id, part_id, part_name, qty) values ('t-job', 't-filter', 'Oil filter', 1)$$, '42501') like '%row-level security%', 'a signed-in browser cannot take parts');
-- Row security hides the parts from it, so this changes nothing (checked below).
update public.part set quantity_in_stock = 99 where id = 't-filter';
reset role;
select pg_temp.expect(pg_temp.stock('t-filter') = 3, 'nothing the browser tried changed the stock');
rollback;
