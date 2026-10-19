# Supabase migrations

Files here are applied to the Supabase project (transittrack-test) automatically
when they reach GitHub, in version order. Supabase keeps a list of the versions
it has applied, and the GitHub link stops applying new files if that list holds
a version that has no file here.

So, if you apply a migration by hand (Supabase MCP `apply_migration` or the SQL
editor), rename its file here to the version Supabase recorded
(`list_migrations`), before or right after. Every statement must be safe to run
twice.

New tables or fields from `base44/entities`: run
`node tools/supabase/gen-schema.mjs --name <what_changed>`.
