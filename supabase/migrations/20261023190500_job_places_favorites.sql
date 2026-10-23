-- Additive migration: existing saved locations and jobs remain unchanged.
alter table public.place add column if not exists favorite boolean not null default false;
-- Existing kind column is text, with validation performed by entityAccess.
alter table public.place drop constraint if exists place_kind_allowed;
alter table public.place add constraint place_kind_allowed
  check (kind is null or kind in ('airport','hotel','taxi_stand','attraction','business','other')) not valid;
