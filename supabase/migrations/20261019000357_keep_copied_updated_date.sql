-- updated_date keeps Base44's time when the copy sends it.
-- Before: every update stamped now(), so copying again overwrote each row's
-- real "last changed" time with the time of the copy.
-- Now: an update that changes nothing is skipped; an update that sets
-- updated_date itself (the copy) keeps that time; any other change (the app,
-- after the switch) is stamped now(). Safe to run twice.
create or replace function public.touch_updated_date() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new is not distinct from old then return null; end if;
  if new.updated_date is distinct from old.updated_date then return new; end if;
  new.updated_date := now();
  return new;
end $$;
