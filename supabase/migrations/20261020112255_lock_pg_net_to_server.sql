-- pg_net comes with its web-request functions open to the app's public roles.
-- Only the scheduler (pg_cron, as postgres) uses them; the queue briefly holds
-- the scheduler's token. Nothing in the app needs anon/authenticated here.
revoke usage on schema net from anon, authenticated;
revoke all on all functions in schema net from public, anon, authenticated;
revoke all on all tables in schema net from anon, authenticated;
revoke all on all sequences in schema net from anon, authenticated;
