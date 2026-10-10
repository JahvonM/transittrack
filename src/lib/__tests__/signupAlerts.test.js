import {describe,it,expect} from 'vitest';
import {load,mock,request} from '../../../security-tests/helpers.js';
const fixture=()=>{
 const sdk=mock('staff');
 sdk.tables.User[0].created_date=new Date().toISOString();
 sdk.tables.User.push({id:'admin',role:'admin',email:'admin@test.invalid'});
 return sdk;
};
const call=(sdk,body={})=>load('notifyAccountCreated',sdk).default(request(body));
describe('new-account admin alerts',()=>{
 it('requires sign-in and never trusts supplied recipients or account IDs',async()=>{
  const anonymous=mock(null);expect((await call(anonymous)).status).toBe(401);expect(anonymous.emails).toEqual([]);
  const sdk=fixture();expect((await call(sdk,{user_id:'victim',email:'evil@test.invalid',to:'evil@test.invalid'})).status).toBe(200);
  expect(sdk.emails).toHaveLength(1);expect(sdk.emails[0].to).toBe('admin@test.invalid');expect(sdk.emails[0].body).toContain('caller@test.invalid');expect(sdk.emails[0].body).not.toContain('evil@test.invalid');
 });
 it('does not email a backlog of old accounts',async()=>{
  const sdk=fixture();sdk.tables.User[0].created_date='2026-10-01T00:00:00Z';
  await call(sdk);expect(sdk.emails).toEqual([]);expect(sdk.tables.SignupAlert||[]).toEqual([]);
 });
 it('saved delivery state survives a new handler and repeat login',async()=>{
  const sdk=fixture();await call(sdk);await call(sdk);
  expect(sdk.emails).toHaveLength(1);expect(sdk.tables.SignupAlert).toHaveLength(1);expect(sdk.tables.SignupAlert[0].completed).toBe(true);
 });
 it('uses the shared durable budget across simultaneous handlers',async()=>{
  const sdk=fixture();await Promise.all(Array.from({length:12},()=>call(sdk)));
  expect(sdk.emails).toHaveLength(1);expect(sdk.tables.SignupAlert).toHaveLength(1);
 });
 it('retries failed recipients without re-emailing successful recipients',async()=>{
  const sdk=fixture();sdk.tables.User.push({id:'admin2',role:'admin',email:'admin2@test.invalid'});
  let failed=true;const delivered=[];
  sdk.asServiceRole.integrations.Core.SendEmail=async data=>{if(data.to==='admin2@test.invalid'&&failed)throw Error('Temporary delivery failure');delivered.push(data.to);};
  const first=await call(sdk);expect((await first.json()).retry_after_ms).toBe(60000);expect(sdk.tables.SignupAlert[0].completed).toBe(false);
  for(const policy of sdk.atomicRows.values())for(const row of policy.rows.values())row.at-=61000;
  failed=false;await call(sdk);expect(delivered).toEqual(['admin@test.invalid','admin2@test.invalid']);expect(sdk.tables.SignupAlert[0].completed).toBe(true);
 });
 it('honours notification settings and records the outcome',async()=>{
  const sdk=fixture();sdk.tables.NotificationSetting=[{id:'off',key:'account_created',enabled:false}];
  await call(sdk);expect(sdk.emails).toEqual([]);expect(sdk.tables.NotificationLog[0].status).toBe('off');
 });
});
