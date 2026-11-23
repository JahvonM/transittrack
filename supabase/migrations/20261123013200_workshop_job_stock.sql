-- Workshop jobs: a part taken from the shelf for a job comes off the Part's
-- stock in the same statement that saves it, and goes back when it is removed
-- or its job is deleted. A part bought for the job leaves the stock alone.
-- Hand-written, not generated; safe to run again.
--
-- Only the server writes these tables (entityAccess, with the service key):
-- row level security is on with no policies, and the functions below are not
-- callable by the app's roles. A refusal uses SQLSTATE PT409, which PostgREST
-- answers as HTTP 409 with the message, shown to the mechanic as it is.

do $$ begin
  alter table public.workshop_job_part add constraint workshop_job_part_qty_positive check (qty > 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.workshop_job_part add constraint workshop_job_part_shelf_needs_part check (not coalesce(from_stock, true) or part_id is not null);
exception when duplicate_object then null; end $$;

create or replace function public.tt_workshop_job_part_stock()
returns trigger language plpgsql set search_path = '' as $$
declare
  given double precision := 0;
  shelf double precision;
begin
  -- Put back what the row took before: it is being removed or changed.
  if tg_op in ('UPDATE', 'DELETE') and coalesce(old.from_stock, true) and old.part_id is not null then
    update public.part set quantity_in_stock = coalesce(quantity_in_stock, 0) + old.qty where id = old.part_id;
    if found then given := old.qty; end if;
  end if;
  -- Take what the row takes now, only while the shelf has that many. The row
  -- lock on the part makes a second taker wait, then look at the new count.
  if tg_op in ('INSERT', 'UPDATE') and coalesce(new.from_stock, true) then
    if new.part_id is null then
      raise exception 'Choose the part from your parts list, or mark it bought for this job' using errcode = 'PT409';
    end if;
    update public.part set quantity_in_stock = coalesce(quantity_in_stock, 0) - new.qty
      where id = new.part_id and coalesce(quantity_in_stock, 0) >= new.qty;
    if not found then
      select coalesce(quantity_in_stock, 0) into shelf from public.part where id = new.part_id;
      if not found then
        raise exception 'That part is no longer in your parts list' using errcode = 'PT409';
      end if;
      -- What the shelf had before this save (without what was just put back).
      if tg_op = 'UPDATE' and old.part_id is distinct from new.part_id then given := 0; end if;
      shelf := greatest(shelf - given, 0);
      if shelf = 0 then
        raise exception 'None left on the shelf' using errcode = 'PT409';
      end if;
      raise exception 'Only % left on the shelf', shelf using errcode = 'PT409';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- Deleting a job removes its parts first, so their stock goes back.
create or replace function public.tt_workshop_job_parts_back()
returns trigger language plpgsql set search_path = '' as $$
begin
  delete from public.workshop_job_part where job_id = old.id;
  return old;
end $$;

revoke all on function public.tt_workshop_job_part_stock() from public, anon, authenticated;
revoke all on function public.tt_workshop_job_parts_back() from public, anon, authenticated;

create or replace trigger workshop_job_part_stock after insert or update or delete on public.workshop_job_part
  for each row execute function public.tt_workshop_job_part_stock();
create or replace trigger workshop_job_parts_back before delete on public.workshop_job
  for each row execute function public.tt_workshop_job_parts_back();
