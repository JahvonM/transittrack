-- One copy of a Base44 file per storage area: the same file can be in a
-- public field (a profile photo) and a private one (a check-in picture), and
-- the private field must point at a private copy. See fileKey in
-- base44/shared/supabaseFiles.ts. Safe to run again.
do $$
begin
  if exists (select 1 from pg_constraint
             where conrelid = 'public.storage_file_copy'::regclass
               and conname = 'storage_file_copy_pkey'
               and pg_get_constraintdef(oid) = 'PRIMARY KEY (source)') then
    alter table public.storage_file_copy drop constraint storage_file_copy_pkey;
    alter table public.storage_file_copy add constraint storage_file_copy_pkey primary key (source, bucket);
  end if;
end $$;
