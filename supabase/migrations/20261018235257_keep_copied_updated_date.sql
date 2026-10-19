-- updated_date follows real changes only.
-- Before this, copying a table from Base44 again stamped every row with the
-- time of the copy, losing Base44's own "last changed" time.
--  - A row written again exactly as it was is left alone.
--  - A writer that sets updated_date itself (the copy from Base44) keeps it.
--  - Any other change sets it to now, as before.
-- Every table's touch trigger calls this one function. Safe to run twice.
create or replace function public.touch_updated_date() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new is not distinct from old then
    return null;
  end if;
  if new.updated_date is distinct from old.updated_date then
    return new;
  end if;
  new.updated_date := now();
  return new;
end $$;
