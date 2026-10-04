import {describe,it,expect} from 'vitest';
import {load,mock,request,interleaveReads} from './helpers';

describe('Step 8 additional release boundaries',()=>{
 for(const functionName of ['notifyAdminMessage','driverSession'])it(functionName+' excludes stale privileged push recipients',async()=>{
  const sdk=mock('company');
  sdk.tables.User.push({id:'former-manager',role:'company',email:'former-manager@test.invalid'});
  sdk.tables.CompanyMembership.push({id:'removed-membership',user_id:'former-manager',company_id:'a',scope:'manager',active:false});
  // Deleted former admin and removed manager still have historical token rows.
  sdk.tables.PushToken=[{id:'old-admin',email:'deleted-admin@test.invalid',role:'admin',token:'STALE_ADMIN'}, {id:'old-manager',email:'former-manager@test.invalid',role:'company',company_id:'a',token:'STALE_MANAGER'}];
  const {pushTokensForChannel}=load(functionName,sdk,['pushTokensForChannel']);
  expect(await pushTokensForChannel(sdk,'company','a')).toEqual([]);
 });
 it('passenger cannot trigger dispatch notification despite having a company membership',async()=>{
  const sdk=mock('passenger');
  const response=await load('notifyAdminMessage',sdk).default(request({channel:'dispatch',company_id:'a',text:'Forged dispatch message',sender_name:'Dispatcher',vehicle_name:'Bus A'}));
  expect(response.status).toBe(403);
 });
 it('public crash reporting keeps its five-email hourly budget under concurrency',async()=>{
  const sdk=mock(null);
  sdk.tables.User=[{id:'admin',role:'admin',email:'admin@test.invalid'}];
  interleaveReads(sdk,'ClientError',20);
  const handler=load('reportClientError',sdk).default;
  const responses=await Promise.all(Array.from({length:20},(_,i)=>handler(request({message:'Isolated crash '+i}))));
  expect(responses.every(r=>r.status===200)).toBe(true);
  expect(sdk.emails.length).toBeLessThanOrEqual(5);
 });
 it('taxi booking cannot create a trip for a company that does not offer taxi service',async()=>{
  const sdk=mock('passenger');
  sdk.tables.Company[1].service_types=['staff_bus'];
  const response=await load('bookTaxi',sdk).default(request({company_id:'b',passenger_name:'Test Rider',phone:'5550000',pickup_name:'A',dropoff_name:'B'}));
  expect([400,403,404]).toContain(response.status);
  expect(sdk.writes).toEqual([]);
 });
});
