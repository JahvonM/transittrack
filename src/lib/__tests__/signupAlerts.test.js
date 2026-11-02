import {describe,it,expect} from 'vitest';
import {load,mock,request} from '../../../security-tests/helpers.js';
const fixture=()=>{
 const sdk=mock('staff');
 sdk.tables.User[0].created_date=new Date().toISOString();
 sdk.tables.User.push({id:'admin',role:'admin',email:'admin@test.invalid'});
 return sdk;
};
const call=(sdk,body={})=>load('notifyAccountCreated',sdk).default(request(body));
// The new person's own welcome email is tested below; these count the admins' notice.
const toAdmins=sdk=>sdk.emails.filter(e=>e.to!=='caller@test.invalid');
describe('new-account admin alerts',()=>{
 it('requires sign-in and never trusts supplied recipients or account IDs',async()=>{
  const anonymous=mock(null);expect((await call(anonymous)).status).toBe(401);expect(anonymous.emails).toEqual([]);
  const sdk=fixture();expect((await call(sdk,{user_id:'victim',email:'evil@test.invalid',to:'evil@test.invalid'})).status).toBe(200);
  expect(toAdmins(sdk)).toHaveLength(1);expect(toAdmins(sdk)[0].to).toBe('admin@test.invalid');expect(toAdmins(sdk)[0].body).toContain('caller@test.invalid');expect(JSON.stringify(sdk.emails)).not.toContain('evil@test.invalid');
 });
 it('does not email a backlog of old accounts',async()=>{
  const sdk=fixture();sdk.tables.User[0].created_date='2026-10-01T00:00:00Z';
  await call(sdk);expect(sdk.emails).toEqual([]);expect(sdk.tables.SignupAlert||[]).toEqual([]);
 });
 it('saved delivery state survives a new handler and repeat login',async()=>{
  const sdk=fixture();await call(sdk);await call(sdk);
  expect(toAdmins(sdk)).toHaveLength(1);expect(sdk.tables.SignupAlert).toHaveLength(1);expect(sdk.tables.SignupAlert[0].completed).toBe(true);
 });
 it('uses the shared durable budget across simultaneous handlers',async()=>{
  const sdk=fixture();await Promise.all(Array.from({length:12},()=>call(sdk)));
  expect(toAdmins(sdk)).toHaveLength(1);expect(sdk.emails.filter(e=>e.to==='caller@test.invalid')).toHaveLength(1);expect(sdk.tables.SignupAlert).toHaveLength(1);
 });
 it('retries failed recipients without re-emailing successful recipients',async()=>{
  const sdk=fixture();sdk.tables.User.push({id:'admin2',role:'admin',email:'admin2@test.invalid'});
  let failed=true;const delivered=[];
  sdk.asServiceRole.integrations.Core.SendEmail=async data=>{if(data.to==='admin2@test.invalid'&&failed)throw Error('Temporary delivery failure');delivered.push(data.to);};
  const first=await call(sdk);expect((await first.json()).retry_after_ms).toBe(60000);expect(sdk.tables.SignupAlert[0].completed).toBe(false);
  for(const policy of sdk.atomicRows.values())for(const row of policy.rows.values())row.at-=61000;
  failed=false;await call(sdk);expect(delivered.filter(to=>to!=='caller@test.invalid')).toEqual(['admin@test.invalid','admin2@test.invalid']);expect(sdk.tables.SignupAlert[0].completed).toBe(true);
  // The welcome went out once, on the first try.
  expect(delivered.filter(to=>to==='caller@test.invalid')).toEqual(['caller@test.invalid']);
 });
 it('honours notification settings and records the outcome',async()=>{
  const sdk=fixture();sdk.tables.NotificationSetting=[{id:'off',key:'account_created',enabled:false}];
  await call(sdk);expect(toAdmins(sdk)).toEqual([]);expect(sdk.tables.NotificationLog.find(l=>l.key==='account_created').status).toBe('off');
 });
});

describe('welcome email to the new person',()=>{
 const welcomes=sdk=>sdk.emails.filter(e=>e.to==='caller@test.invalid');
 it('goes once to the signed-in person, with the next steps, and never to an address from the request',async()=>{
  const sdk=fixture();sdk.tables.User[0].display_name='Jane Roberts';
  await call(sdk,{email:'evil@test.invalid',to:'evil@test.invalid'});await call(sdk);
  expect(welcomes(sdk)).toHaveLength(1);
  const [w]=welcomes(sdk);
  expect(w.subject).toBe('Welcome to McSween Transport');
  expect(w.body).toContain('Hi Jane,');expect(w.body).toContain('Add to Home Screen');expect(w.body).toContain('https://app.mcsweenstransport.com');
  expect(JSON.stringify(sdk.emails)).not.toContain('evil@test.invalid');
  expect(sdk.tables.SignupAlert[0].welcome_sent_at).toBeTruthy();
  expect(sdk.tables.NotificationLog.find(l=>l.key==='welcome')).toMatchObject({status:'sent',recipients:['caller@test.invalid']});
 });
 it('is not sent to accounts made before it went live (the admins still hear about them)',async()=>{
  const sdk=fixture();sdk.tables.User[0].created_date='2026-11-01T00:00:00Z';
  await call(sdk);expect(welcomes(sdk)).toEqual([]);expect(toAdmins(sdk)).toHaveLength(1);
  expect(sdk.tables.SignupAlert[0].completed).toBe(true);
 });
 it('is held back when switched off, and never goes to a driver\'s internal sign-in',async()=>{
  const off=fixture();off.tables.NotificationSetting=[{id:'w',key:'welcome',enabled:false}];
  await call(off);expect(welcomes(off)).toEqual([]);expect(toAdmins(off)).toHaveLength(1);
  expect(off.tables.SignupAlert[0].welcome_sent_at).toBeTruthy();
  const driver=fixture();driver.tables.User[0]={...driver.tables.User[0],role:'driver',email:'driver.kofi@login.mcsweenstransport.com'};
  await call(driver);expect(driver.emails.filter(e=>e.to.includes('login.mcsweenstransport.com'))).toEqual([]);
  expect(driver.tables.SignupAlert[0].welcome_sent_at).toBeTruthy();
 });
 it('a failed welcome is tried again without emailing the admins twice',async()=>{
  const sdk=fixture();let failing=true;const delivered=[];
  sdk.asServiceRole.integrations.Core.SendEmail=async data=>{if(data.to==='caller@test.invalid'&&failing)throw Error('Temporary delivery failure');delivered.push(data.to);};
  expect((await (await call(sdk)).json()).retry_after_ms).toBe(60000);
  expect(sdk.tables.SignupAlert[0]).toMatchObject({completed:true});expect(sdk.tables.SignupAlert[0].welcome_sent_at).toBeFalsy();
  for(const policy of sdk.atomicRows.values())for(const row of policy.rows.values())row.at-=61000;
  failing=false;expect((await (await call(sdk)).json()).retry_after_ms).toBeUndefined();
  expect(delivered).toEqual(['admin@test.invalid','caller@test.invalid']);
 });
});
