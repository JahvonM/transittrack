// Parts used on Workshop jobs come off the stock in the database. Runs only
// against the isolated CI PostgreSQL database, never a hosted project.
import fs from 'node:fs';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
const url=process.env.TT_TEST_DATABASE_URL;
if(!url || !['localhost','127.0.0.1'].includes(new URL(url).hostname) || new URL(url).pathname!=='/tt_workshop_test') throw Error('Use isolated localhost database tt_workshop_test');
const args=[url,'-X','-v','ON_ERROR_STOP=1','-At'];
const sql=async text=>(await promisify(execFile)('psql',[...args,'-c',text],{maxBuffer:4e6})).stdout.trim();
const migration=name=>fs.readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
// Supabase's roles: the service key skips row security; the browser roles
// get table rights by default, so only row security keeps them out.
await sql("do $$ begin create role anon; exception when duplicate_object then null; end $$; do $$ begin create role authenticated; exception when duplicate_object then null; end $$; do $$ begin create role service_role bypassrls; exception when duplicate_object then null; end $$;");
await sql(migration('20261014000000_tables.sql'));
await sql(migration('20261014135142_lock_tables.sql'));
await sql(migration('20261123013124_workshop_jobs.sql'));
// The stock migration is safe to apply twice.
await sql(migration('20261123013200_workshop_job_stock.sql'));
await sql(migration('20261123013200_workshop_job_stock.sql'));
await sql("grant usage on schema public to anon, authenticated, service_role; grant all on all tables in schema public to anon, authenticated, service_role;");
await sql(fs.readFileSync(new URL('../supabase/tests/workshop_stock.sql',import.meta.url),'utf8'));
console.log('PASS: take, refuse, change, put back, bought for the job, job deletion, and no browser access');

// Two mechanics take the last filters at once: one gets them, the other is
// told how many are left, and the count never goes below zero.
await sql("insert into public.part(id,part_name,quantity_in_stock) values ('race-filter','Oil filter',3); insert into public.workshop_job(id,vehicle_kind,vehicle_id,title) values ('race-a','bus','race-bus','Service'),('race-b','bus','race-bus','Service');");
let ready;
const locked=new Promise(resolve=>{ready=resolve;});
const child=spawn('psql',[...args,'-c',"begin; set local role service_role; insert into public.workshop_job_part(job_id,part_id,part_name,qty) values ('race-a','race-filter','Oil filter',2); select 'LOCKED'; select pg_sleep(1); commit;"]);
let output='',errors='';
child.stdout.on('data',chunk=>{output+=chunk; if(output.includes('LOCKED'))ready();});
child.stderr.on('data',chunk=>{errors+=chunk;});
const finished=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(errors)));});
await Promise.race([locked,finished.then(()=>{if(!output.includes('LOCKED'))throw Error('The first taker did not hold the part');})]);
await assert.rejects(sql("set role service_role; insert into public.workshop_job_part(job_id,part_id,part_name,qty) values ('race-b','race-filter','Oil filter',2);"),/Only 1 left on the shelf/);
await finished;
assert.equal(await sql("select quantity_in_stock from public.part where id='race-filter';"),'1');
assert.equal(await sql("select string_agg(job_id,',') from public.workshop_job_part where part_id='race-filter';"),'race-a');
console.log('PASS: two takers at once never push the stock below zero');
