-- Step 5 of the move to Supabase: files.
-- Three storage areas. Only the server (secret key) uploads, lists or
-- deletes: storage.objects keeps row level security on with no policies.
--   public    - logos, bus photos, ads, parts, profile photos. Anyone with a
--               link can view; links have random names that can't be guessed.
--   private   - boarding-camera pictures, signatures, chat photos, incident,
--               fault and inspection photos, driver documents. Shown only
--               through short-lived signed links the server makes.
--   downloads - the TransitTrack Helper app for tablet setup. Private: the
--               admin screen gets it through the server, never a public link.
-- No SVG anywhere: an SVG can carry script.
-- Every statement is safe to run twice.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('public', 'public', true, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  ('private', 'private', false, 26214400, array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'application/pdf']),
  ('downloads', 'downloads', false, 52428800, array['application/vnd.android.package-archive'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Which Base44 file became which Supabase file, so copying the tables again
-- keeps pointing at the copied file. Server only.
create table if not exists public.storage_file_copy (
  source text primary key,
  bucket text not null check (bucket in ('public', 'private', 'downloads')),
  path text not null,
  content_type text not null,
  bytes bigint not null,
  copied_at timestamptz not null default now()
);
alter table public.storage_file_copy enable row level security;
