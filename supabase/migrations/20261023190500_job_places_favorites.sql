-- Additive migration: existing saved locations and jobs remain unchanged.
alter table public.place add column if not exists favorite boolean not null default false;
-- Existing kind column is text, with validation performed by entityAccess.
