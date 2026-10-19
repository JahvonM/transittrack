-- Step 4 of the move to Supabase: sign-in.
-- A Supabase sign-in account (auth.users) is linked to the TransitTrack
-- person with the same email (public.app_user.auth_user_id), but only once
-- that email is confirmed: by Google/Apple, by the confirmation code, or
-- because Base44 had already verified it. An unconfirmed sign-up can never
-- take over someone's account.
-- Every statement is safe to run twice (the repo's GitHub link may apply this
-- file after it was run by hand).

-- Functions the browser API must never reach.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- One TransitTrack person per email, so the match is never ambiguous.
create unique index if not exists app_user_email_unique_idx
  on public.app_user (lower(email)) where email is not null and email <> '';

-- A deleted sign-in account leaves the person in place, unlinked.
do $$ begin
  alter table public.app_user add constraint app_user_auth_user_fk
    foreign key (auth_user_id) references auth.users (id) on delete set null;
exception when duplicate_object then null; end $$;

create or replace function private.link_app_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is null or new.email = '' or new.email_confirmed_at is null then
    return new;
  end if;
  -- A linked person whose sign-in email changed (confirmed) keeps the link.
  if tg_op = 'UPDATE' and old.email is distinct from new.email then
    update public.app_user set email = new.email where auth_user_id = new.id;
    if found then return new; end if;
  end if;
  -- The person with this email, unless someone else's account is linked.
  update public.app_user set auth_user_id = new.id
   where lower(email) = lower(new.email)
     and (auth_user_id is null or auth_user_id = new.id);
  if found then return new; end if;
  -- Someone new: a plain user, as Base44 does. Roles are only ever given by
  -- an administrator, never taken from what the person typed at sign-up.
  insert into public.app_user (email, full_name, role, is_verified, auth_user_id)
  values (
    new.email,
    nullif(left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 200), ''),
    'user', true, new.id)
  on conflict do nothing;
  return new;
end $$;
revoke all on function private.link_app_user() from public, anon, authenticated;

create or replace trigger link_app_user
  after insert or update of email, email_confirmed_at on auth.users
  for each row execute function private.link_app_user();
