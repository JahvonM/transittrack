-- An unchanged device refresh must still return its matched row to PostgREST.
-- Returning NULL made successful no-op updates look like missing records (404).
-- Keep its existing timestamp, and continue preserving explicitly copied times.
create or replace function public.touch_updated_date() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new is not distinct from old then return new; end if;
  if new.updated_date is distinct from old.updated_date then return new; end if;
  new.updated_date := now();
  return new;
end $$;
