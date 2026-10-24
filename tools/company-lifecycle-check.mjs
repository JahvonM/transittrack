// Run only against the isolated CI PostgreSQL database, never a hosted project.
import fs from 'node:fs';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
const url=process.env.TT_TEST_DATABASE_URL;
if(!url || !['localhost','127.0.0.1'].includes(new URL(url).hostname) || new URL(url).pathname!=='/tt_company_test') throw Error('Use isolated localhost database tt_company_test');
const args=[url,'-X','-v','ON_ERROR_STOP=1','-At'];
const sql=async text=>(await promisify(execFile)('psql',[...args,'-c',text],{maxBuffer:4e6})).stdout.trim();
await sql("create role anon; create role authenticated; create role service_role;");
for(const name of ['20261014000000_tables.sql','20261018141432_roles_tablet_sessions_new_fields.sql','20261019001738_native_tracking_health.sql','20261022110455_job_progress_controls.sql','20261023190500_job_places_favorites.sql','20261024000100_allow_unassigned_company_assets.sql','20261024000200_company_lifecycle.sql']) await sql(fs.readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
// Migration is safe to apply twice, without running cleanup.
await sql(fs.readFileSync(new URL('../supabase/migrations/20261024000200_company_lifecycle.sql',import.meta.url),'utf8'));
await sql(fs.readFileSync(new URL('../supabase/tests/company_lifecycle.sql',import.meta.url),'utf8'));
console.log('PASS: authorization, rollback injection, retention, revocation, recovery and retries');
await sql("insert into public.app_user(id,role) values ('race-admin','admin'); insert into public.company(id,name) values ('race-co','Race');");
// A second connection tries to insert an assignment while cleanup holds locks.
let ready;
const locked=new Promise(resolve=>{ready=resolve;});
const child=spawn('psql',[...args,'-c',"begin; select public.tt_company_lifecycle('race-admin','race-co','delete'); select 'LOCKED'; select pg_sleep(1); commit;"]);
let output='',errors='';
child.stdout.on('data',chunk=>{output+=chunk; if(output.includes('LOCKED'))ready();});
child.stderr.on('data',chunk=>{errors+=chunk;});
const finished=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(errors)));});
await Promise.race([locked,finished.then(()=>{if(!output.includes('LOCKED'))throw Error('Deletion did not acquire lock');})]);
await assert.rejects(sql("insert into public.driver(id,full_name,company_id) values ('stale-driver','Stale','race-co');"),/Company not found/);
await finished;
assert.equal(await sql("select count(*) from public.driver where company_id='race-co';"),'0');
console.log('PASS: independent concurrent writer cannot recreate orphan assignments');
