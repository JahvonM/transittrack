-- Driver phone accounts: existing Driver rows remain safe and inactive until an admin provisions them.
-- The Supabase Auth UUID is a credential identity; Driver.id remains the permanent staff identity.
alter table public.driver add column if not exists username text;
alter table public.driver add column if not exists auth_user_id text;
alter table public.driver add column if not exists must_change_password boolean default false;
alter table public.vehicle add column if not exists driver_id text;

-- Case-folded usernames cannot be claimed twice, even in concurrent admin requests.
create unique index if not exists driver_username_unique_idx
  on public.driver (lower(username)) where username is not null and username <> '';
create unique index if not exists driver_auth_user_unique_idx
  on public.driver (auth_user_id) where auth_user_id is not null and auth_user_id <> '';

-- Deleting a Driver does not delete buses, journeys, or vehicle history.
do $$ begin
  alter table public.vehicle add constraint vehicle_driver_id_fk
    foreign key (driver_id) references public.driver(id) on delete set null;
exception when duplicate_object then null; end $$;
