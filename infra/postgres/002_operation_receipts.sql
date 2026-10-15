-- Apply after 001_attempt_budget.sql. Does not enable callers or alter app records.
begin;
create table if not exists tt_atomic.operation_receipt (
 scope_hash text primary key check (scope_hash ~ '^[a-f0-9]{64}$'),
 payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
 owner_id uuid not null,
 record_id text,
 created_at timestamptz not null default pg_catalog.clock_timestamp(),
 completed_at timestamptz,
 check (record_id is null or record_id ~ '^[A-Za-z0-9_-]{1,128}$')
);
alter table tt_atomic.operation_receipt enable row level security;
revoke all on tt_atomic.operation_receipt from public, anon, authenticated, service_role;

create or replace function public.tt_operation_claim(p_scope_hash text,p_payload_hash text,p_owner_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r tt_atomic.operation_receipt%rowtype; inserted boolean := false;
begin
 if p_scope_hash is null or p_scope_hash !~ '^[a-f0-9]{64}$' or
 p_payload_hash is null or p_payload_hash !~ '^[a-f0-9]{64}$' or p_owner_id is null then
 raise exception 'Invalid operation' using errcode='22023'; end if;
 insert into tt_atomic.operation_receipt(scope_hash,payload_hash,owner_id)
 values(p_scope_hash,p_payload_hash,p_owner_id) on conflict do nothing returning true into inserted;
 select * into strict r from tt_atomic.operation_receipt where scope_hash=p_scope_hash for update;
 if r.payload_hash <> p_payload_hash then return jsonb_build_object('state','conflict'); end if;
 if inserted then return jsonb_build_object('state','acquired'); end if;
 if r.record_id is not null then return jsonb_build_object('state','done','record_id',r.record_id); end if;
 -- Never reclaim on timeout, restart or repeat owner ID: the external write may have committed.
 return jsonb_build_object('state','pending');
end $$;

create or replace function public.tt_operation_complete(p_scope_hash text,p_payload_hash text,p_owner_id uuid,p_record_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare r tt_atomic.operation_receipt%rowtype;
begin
 if p_record_id is null or p_record_id !~ '^[A-Za-z0-9_-]{1,128}$' then
 raise exception 'Invalid record identity' using errcode='22023'; end if;
 select * into r from tt_atomic.operation_receipt where scope_hash=p_scope_hash for update;
 if not found or r.payload_hash <> p_payload_hash or r.owner_id <> p_owner_id then return false; end if;
 if r.record_id is not null then return r.record_id=p_record_id; end if;
 update tt_atomic.operation_receipt set record_id=p_record_id,completed_at=pg_catalog.clock_timestamp() where scope_hash=p_scope_hash;
 return true;
end $$;
revoke all on function public.tt_operation_claim(text,text,uuid) from public,anon,authenticated;
revoke all on function public.tt_operation_complete(text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.tt_operation_claim(text,text,uuid) to service_role;
grant execute on function public.tt_operation_complete(text,text,uuid,text) to service_role;
comment on table tt_atomic.operation_receipt is 'Permanent replay tombstones. No expiry/reclaim. Pending external writes require reconciliation; never delete to retry.';
commit;
