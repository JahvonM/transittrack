// Database acceptance test: ONLY a disposable localhost database named tt_atomic_test.
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const connection=process.env.TT_TEST_DATABASE_URL;
if(!connection)throw Error('TT_TEST_DATABASE_URL is required');
const target=new URL(connection);
if(!['127.0.0.1','localhost'].includes(target.hostname)||target.pathname!=='/tt_atomic_test')throw Error('Use only the disposable localhost tt_atomic_test database');
function sql(text){return new Promise((resolve,reject)=>{const p=spawn('psql',['-X','-q','-t','-A','-v','ON_ERROR_STOP=1'],{env:{...process.env,PGDATABASE:connection},stdio:['pipe','pipe','pipe']});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',reject);p.on('exit',code=>code===0?resolve(out.trim()):reject(Error('SQL test failed: '+err.replaceAll(connection,'[redacted]'))));p.stdin.end(text);});}
await sql(`do $$ begin if not exists(select from pg_roles where rolname='anon') then create role anon; end if; if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if; if not exists(select from pg_roles where rolname='service_role') then create role service_role; end if; end $$;`);
await sql(await readFile(new URL('../infra/postgres/001_attempt_budget.sql',import.meta.url),'utf8'));
const scope=randomUUID().replaceAll('-','').repeat(2);
const ids=Array.from({length:20},()=>randomUUID());
const reserve=(key,id,limit=5,window=60000)=>sql(`set role service_role; select public.tt_reserve_attempt('${key}','${id}',${limit},${window});`);
// Every call creates an independent psql process/connection, with no shared JS mutex.
const decisions=await Promise.all(ids.map(id=>reserve(scope,id)));
assert.equal(decisions.filter(x=>x==='t').length,5);
console.log('PASS: 20 independent transactions admit exactly five attempts');
const before=await sql(`select count(*) from tt_atomic.attempt_reservation where scope_hash='${scope}';`);
assert.deepEqual(await Promise.all(ids.map(id=>reserve(scope,id))),decisions);
assert.equal(await sql(`select count(*) from tt_atomic.attempt_reservation where scope_hash='${scope}';`),before);
console.log('PASS: restarted callers recover the same decisions without extra reservations');
await assert.rejects(reserve(scope,ids[0],6),/policy mismatch/);
console.log('PASS: changed policy cannot bypass the budget');
for(const role of ['anon','authenticated']){
 await assert.rejects(sql(`set role ${role};select public.tt_reserve_attempt('${scope}','${randomUUID()}',5,60000);`),/permission denied/);
 await assert.rejects(sql(`set role ${role};select * from tt_atomic.attempt_reservation;`),/permission denied/);
}
console.log('PASS: anonymous and signed-in client roles cannot invoke/read budgets');
await sql(`update tt_atomic.attempt_reservation set attempted_at=clock_timestamp()-interval '61 seconds' where scope_hash='${scope}';`);
assert.equal(await reserve(scope,randomUUID()),'t');
console.log('PASS: rolling-window capacity recovers after expiry');
// Delete only this test's synthetic namespace, retaining other tests' rows.
await sql(`delete from tt_atomic.attempt_reservation where scope_hash='${scope}';delete from tt_atomic.budget_policy where scope_hash='${scope}';`);
