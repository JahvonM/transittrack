import {describe,it,expect} from 'vitest';
import {load,mock,request,digest} from '../../../security-tests/helpers.js';
function setup() {
 const sdk=mock('staff');
 Object.assign(sdk.tables.Vehicle[0],{trip_direction:'to_home',tracking_active:true,trip_direction_started_at:'run-1'});
 sdk.tables.Workplace=[{id:'work',company_id:'a',name:'Company A',lat:12,lng:-61.7}];
 sdk.tables.CompanyMembership[0].vehicle_id='bus-a';
 return {sdk,run:load('driverSession',sdk,['updateReturnPickup']).updateReturnPickup};
}
const sample=(lat=12.005,age=0)=>({current_lat:lat,current_lng:-61.7,last_location_update:new Date(Date.now()-age).toISOString()});
describe('company pickup alerts for going home',()=>{
 it('sends near and arrival once each across concurrent updates, then marks departure',async()=>{
  const {sdk,run}=setup();
  await Promise.all(Array.from({length:8},()=>run(sdk,structuredClone(sdk.tables.Vehicle[0]),sample())));
  expect(sdk.emails).toHaveLength(1);expect(sdk.tables.Broadcast).toHaveLength(1);
  await run(sdk,sdk.tables.Vehicle[0],sample(12));
  await run(sdk,sdk.tables.Vehicle[0],sample(12));
  expect(sdk.emails).toHaveLength(2);
  expect(sdk.tables.Vehicle[0].return_pickup_state).toBe('arrived');
  await run(sdk,sdk.tables.Vehicle[0],sample(12.004));
  expect(sdk.tables.Vehicle[0].return_pickup_state).toBe('departed');
  await run(sdk,sdk.tables.Vehicle[0],sample(12));
  expect(sdk.emails).toHaveLength(2);
 });
 it('does not alert for work journeys, stale GPS, stopped tracking or missing company point',async()=>{
  for(const mode of ['work','stale','inactive','missing']) {
   const {sdk,run}=setup();
   if(mode==='work') sdk.tables.Vehicle[0].trip_direction='to_work';
   if(mode==='inactive') sdk.tables.Vehicle[0].tracking_active=false;
   if(mode==='missing') sdk.tables.Workplace=[];
   await run(sdk,sdk.tables.Vehicle[0],sample(12.005,mode==='stale'?120000:0));
   expect(sdk.emails).toHaveLength(0);expect(sdk.tables.Broadcast||[]).toHaveLength(0);
  }
 });
 it('targets approved assigned bus staff and ignores profile company, removed membership, other bus and stale join codes',async()=>{
  const {sdk,run}=setup();
  for(const [id,member,extra] of [
   ['otherbus',{vehicle_id:'bus-b'},{}],
   ['removed',{active:false},{}],
   ['foreign',{company_id:'b'},{}],
   ['oldcode',{code_hash:digest('OLD')},{}],
   ['manager',{}, {role:'company'}],
   ['skip',{}, {skip_pickup_today:true}],
  ]) {
   sdk.tables.User.push({id,role:'staff',email:id+'@test.invalid',...extra});
   sdk.tables.CompanyMembership.push({id:'m-'+id,user_id:id,company_id:'a',vehicle_id:'bus-a',scope:'passenger',active:true,...member});
  }
  await run(sdk,sdk.tables.Vehicle[0],sample());
  expect(sdk.emails.map(x=>x.to)).toEqual(['caller@test.invalid']);
 });
 it('uses notification settings and restarts pickup state on a new service day',async()=>{
  const {sdk,run}=setup();
  sdk.tables.Vehicle[0].return_pickup_state='departed';sdk.tables.Vehicle[0].return_pickup_date='2000-01-01';
  sdk.tables.NotificationSetting=[{id:'off',key:'return_pickup_email',enabled:false}];
  await run(sdk,sdk.tables.Vehicle[0],sample());
  expect(sdk.emails).toHaveLength(0);expect(sdk.tables.Vehicle[0].return_pickup_state).toBe('near');
 });
 it('gateway exposes safe return status and restricts pickup notices to the assigned bus',async()=>{
  const {sdk}=setup();
  sdk.tables.Broadcast=[{id:'yes',company_id:'a',vehicle_id:'bus-a',return_pickup:true},{id:'no',company_id:'b',vehicle_id:'bus-b',return_pickup:true}];
  const handle=load('entityAccess',sdk).default;
  let res=await handle(request({entity:'Broadcast',operation:'list'}));
  expect((await res.json()).result.map(x=>x.id)).toEqual(['yes']);
  sdk.tables.CompanyMembership[0].vehicle_id='bus-b';
  res=await handle(request({entity:'Broadcast',operation:'list'}));
  expect((await res.json()).result).toEqual([]);
  res=await handle(request({entity:'Vehicle',operation:'list'}));
  const bus=(await res.json()).result[0];
  expect(bus.trip_direction).toBe('to_home');expect(bus.driver_pin).toBeUndefined();
 });
});
