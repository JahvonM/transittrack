import {describe,it,expect} from 'vitest';
import {load,mock,request} from '../../../security-tests/helpers';

// A company (a hotel whose staff and guests ride the buses) sees where a bus
// is only while a driver's shift is open on it, or while a job dispatch
// shared with the company is under way on it. No location history.

const at={current_lat:12.05,current_lng:-61.75,trail:[{lat:12.05,lng:-61.75,t:1}],speed:40,heading:90,last_location_update:'2026-10-28T10:00:00Z',near_stop_id:'s1',road_next_stop:{name:'Stop 1'}};
function setup(role='company') {
 const sdk=mock(role);
 sdk.tables.Vehicle=[
  {id:'bus-a',company_id:'a',name:'Bus A',...at},
  {id:'bus-a2',company_id:'a',name:'Bus A2',...at},
  {id:'bus-a3',company_id:'a',name:'Bus A3',...at},
  {id:'bus-b',company_id:'b',name:'Bus B',...at},
 ];
 sdk.tables.DriverShift=[];
 sdk.tables.Trip=[];
 sdk.tables.LocationPing=[{id:'p1',company_id:'a',vehicle_id:'bus-a',lat:12,lng:-61,recorded_at:'2026-10-28T09:00:00Z'}];
 sdk.tables.DrivingEvent=[{id:'e1',company_id:'a',vehicle_id:'bus-a',lat:12,lng:-61,type:'harsh_brake'}];
 return {sdk,call:async body=>{const res=await load('entityAccess',sdk).default(request(body));return {status:res.status,body:await res.json()};}};
}
const byId=rows=>Object.fromEntries(rows.map(r=>[r.id,r]));
const hoursAgo=h=>new Date(Date.now()-h*3600_000).toISOString();

describe('company bus locations',()=>{
 it('hides every bus position when no shift or shared job is open',async()=>{
  const {call}=setup();
  const {body}=await call({entity:'Vehicle',operation:'list'});
  expect(body.result.map(v=>v.id).sort()).toEqual(['bus-a','bus-a2','bus-a3']);
  for(const bus of body.result) {
   for(const field of ['current_lat','current_lng','trail','speed','heading','last_location_update','near_stop_id','road_next_stop']) expect(bus[field],bus.id+' '+field).toBeNull();
   expect(bus.location_shared).toBe('');
   expect(bus.name).toBeTruthy();
  }
 });

 it('shows a bus while its shift is open, and hides it again when the shift ends',async()=>{
  const {sdk,call}=setup();
  sdk.tables.DriverShift=[{id:'s1',company_id:'a',vehicle_id:'bus-a',started_at:hoursAgo(2)},{id:'s0',company_id:'a',vehicle_id:'bus-a2',started_at:hoursAgo(30),ended_at:hoursAgo(21)}];
  let buses=byId((await call({entity:'Vehicle',operation:'list'})).body.result);
  expect(buses['bus-a']).toMatchObject({current_lat:12.05,current_lng:-61.75,location_shared:'shift'});
  expect(buses['bus-a2'].current_lat).toBeNull();
  sdk.tables.DriverShift[0].ended_at='2026-10-28T14:00:00Z';
  buses=byId((await call({entity:'Vehicle',operation:'list'})).body.result);
  expect(buses['bus-a'].current_lat).toBeNull();
  // One bus read on its own follows the same rule.
  sdk.tables.DriverShift[0].ended_at=undefined;
  expect((await call({entity:'Vehicle',operation:'get',id:'bus-a'})).body.result.location_shared).toBe('shift');
 });

 it('stops showing a bus whose shift was left open for more than 18 hours',async()=>{
  const {sdk,call}=setup();
  sdk.tables.DriverShift=[{id:'s1',company_id:'a',vehicle_id:'bus-a',started_at:hoursAgo(19)}];
  expect(byId((await call({entity:'Vehicle',operation:'list'})).body.result)['bus-a']).toMatchObject({current_lat:null,trail:null,location_shared:''});
  sdk.tables.DriverShift[0].started_at=hoursAgo(17);
  expect(byId((await call({entity:'Vehicle',operation:'list'})).body.result)['bus-a']).toMatchObject({current_lat:12.05,location_shared:'shift'});
 });

 it('shows a bus while a shared job is under way on it, and not once the job ends',async()=>{
  const {sdk,call}=setup();
  sdk.tables.Trip=[
   {id:'j1',company_id:'a',vehicle_id:'bus-a2',job_type:'airport_pickup',status:'on_the_way',shared_with_company:true},
   {id:'j2',company_id:'a',vehicle_id:'bus-a3',job_type:'airport_pickup',status:'on_the_way'},
  ];
  let buses=byId((await call({entity:'Vehicle',operation:'list'})).body.result);
  expect(buses['bus-a2']).toMatchObject({current_lat:12.05,location_shared:'job'});
  // Not shared with them: a website customer's ride on their bus stays private.
  expect(buses['bus-a3'].current_lat).toBeNull();
  sdk.tables.Trip[0].status='arrived';
  expect(byId((await call({entity:'Vehicle',operation:'list'})).body.result)['bus-a2'].location_shared).toBe('job');
  sdk.tables.Trip[0].status='completed';
  expect(byId((await call({entity:'Vehicle',operation:'list'})).body.result)['bus-a2'].current_lat).toBeNull();
  sdk.tables.Trip[0].status='scheduled';
  expect(byId((await call({entity:'Vehicle',operation:'list'})).body.result)['bus-a2'].current_lat).toBeNull();
 });

 it('looks shifts and jobs up once for a whole list of buses',async()=>{
  const {sdk,call}=setup();
  await call({entity:'Vehicle',operation:'list'});
  expect(sdk.reads.filter(r=>r.name==='DriverShift')).toHaveLength(1);
  expect(sdk.reads.filter(r=>r.name==='Trip')).toHaveLength(1);
 });

 it('gives a company no location history',async()=>{
  const {call}=setup();
  for(const entity of ['LocationPing','DrivingEvent']) {
   expect((await call({entity,operation:'list'})).body.result,entity).toEqual([]);
   expect((await call({entity,operation:'get',id:entity==='LocationPing'?'p1':'e1'})).status,entity).toBe(404);
   expect((await call({entity,operation:'create',data:{vehicle_id:'bus-a',lat:1,lng:1}})).status,entity).toBe(403);
  }
 });

 it('leaves the tablet GPS fix out of the bus tablet health',async()=>{
  const {sdk,call}=setup();
  sdk.tables.KioskDevice[0].app_health={build:'1.2',lat:12.05,lng:-61.75,online:true};
  const [tablet]=(await call({entity:'KioskDevice',operation:'list'})).body.result;
  expect(tablet.app_health).toEqual({build:'1.2',online:true});
 });

 it('leaves administrators as they were',async()=>{
  const {call}=setup('admin');
  const bus=byId((await call({entity:'Vehicle',operation:'list'})).body.result)['bus-a'];
  expect(bus.current_lat).toBe(12.05);
  expect(bus.trail).toEqual([{lat:12.05,lng:-61.75,t:1}]);
 });
});

// A passenger sees only their own bus (the one the office set for them), only
// while a shift is out on it, and never a bus's path: a path, a parked bus or
// another bus's moves show where buses stopped for other passengers.
describe('passenger bus locations',()=>{
 const LOCATION=['current_lat','current_lng','speed','heading','last_location_update','road_next_stop'];

 it('sends no bus path, and no position while no shift is out',async()=>{
  const {call}=setup('staff');
  const buses=(await call({entity:'Vehicle',operation:'list'})).body.result;
  expect(buses.map(v=>v.id).sort()).toEqual(['bus-a','bus-a2','bus-a3']);
  for(const bus of buses) {
   expect(bus.trail,bus.id).toBeUndefined();
   for(const field of LOCATION) expect(bus[field],bus.id+' '+field).toBeNull();
   expect(bus.name).toBeTruthy();
  }
 });

 it('shows their own bus while its shift is out, and never another bus',async()=>{
  const {sdk,call}=setup('staff');
  sdk.tables.DriverShift=[
   {id:'mine',company_id:'a',vehicle_id:'bus-a',started_at:hoursAgo(2)},
   {id:'other',company_id:'a',vehicle_id:'bus-a2',started_at:hoursAgo(2)},
  ];
  let buses=byId((await call({entity:'Vehicle',operation:'list'})).body.result);
  expect(buses['bus-a']).toMatchObject({current_lat:12.05,current_lng:-61.75,speed:40});
  expect(buses['bus-a'].trail).toBeUndefined();
  for(const field of LOCATION) expect(buses['bus-a2'][field],'bus-a2 '+field).toBeNull();
  sdk.tables.DriverShift[0].ended_at=hoursAgo(0);
  buses=byId((await call({entity:'Vehicle',operation:'list'})).body.result);
  expect(buses['bus-a'].current_lat).toBeNull();
  // One bus read on its own follows the same rule.
  delete sdk.tables.DriverShift[0].ended_at;
  expect((await call({entity:'Vehicle',operation:'get',id:'bus-a'})).body.result.current_lat).toBe(12.05);
  expect((await call({entity:'Vehicle',operation:'get',id:'bus-a2'})).body.result.current_lat).toBeNull();
 });

 it('treats a shift left open for more than 18 hours as over',async()=>{
  const {sdk,call}=setup('staff');
  sdk.tables.DriverShift=[{id:'forgotten',company_id:'a',vehicle_id:'bus-a',started_at:hoursAgo(19)}];
  expect(byId((await call({entity:'Vehicle',operation:'list'})).body.result)['bus-a'].current_lat).toBeNull();
 });

 it('follows the bus the office set: the directory card first, then the app membership',async()=>{
  const {sdk,call}=setup('staff');
  sdk.tables.DriverShift=[{id:'s',company_id:'a',vehicle_id:'bus-a2',started_at:hoursAgo(1)}];
  const busA2=async()=>byId((await call({entity:'Vehicle',operation:'list'})).body.result)['bus-a2'].current_lat;
  // The card says Bus A, so Bus A2's shift doesn't show.
  expect(await busA2()).toBeNull();
  sdk.tables.Contact[0].vehicle_id='bus-a2';
  expect(await busA2()).toBe(12.05);
  // No card: the membership's bus.
  sdk.tables.Contact=[];
  sdk.tables.CompanyMembership[0].vehicle_id='bus-a2';
  expect(await busA2()).toBe(12.05);
  sdk.tables.CompanyMembership[0].vehicle_id='';
  expect(await busA2()).toBeNull();
 });

 it('gives the passenger home and the live refresh the same view',async()=>{
  const {sdk,call}=setup('staff');
  sdk.tables.DriverShift=[{id:'s',company_id:'a',vehicle_id:'bus-a',started_at:hoursAgo(1)},{id:'s2',company_id:'a',vehicle_id:'bus-a2',started_at:hoursAgo(1)}];
  const home=byId((await call({entity:'Bootstrap',operation:'list',company_id:'a'})).body.result.vehicles);
  const live=byId((await call({entity:'LiveLists',operation:'list',entities:['Vehicle']})).body.result.lists.Vehicle);
  for(const buses of [home,live]) {
   expect(buses['bus-a'].current_lat).toBe(12.05);
   expect(buses['bus-a'].trail).toBeUndefined();
   expect(buses['bus-a2'].current_lat).toBeNull();
  }
 });

 it('looks the bus and its shift up once per request',async()=>{
  const {sdk,call}=setup('staff');
  await call({entity:'Vehicle',operation:'list'});
  expect(sdk.reads.filter(r=>r.name==='DriverShift')).toHaveLength(1);
  expect(sdk.reads.filter(r=>r.name==='Vehicle' && r.method==='get')).toHaveLength(0);
 });
});

describe('company jobs',()=>{
 it('shows a company only the jobs shared with it, plus its staff trips',async()=>{
  const {sdk,call}=setup();
  sdk.tables.Trip=[
   {id:'shared',company_id:'a',vehicle_id:'bus-a',job_type:'airport_pickup',status:'scheduled',shared_with_company:true,passenger_name:'Guest'},
   {id:'private',company_id:'a',vehicle_id:'bus-a',job_type:'transfer',status:'scheduled',passenger_name:'Website customer',passenger_phone:'+1 473 555 0000'},
   {id:'staff',company_id:'a',vehicle_id:'bus-a',status:'scheduled'},
  ];
  expect((await call({entity:'Trip',operation:'list'})).body.result.map(t=>t.id).sort()).toEqual(['shared','staff']);
  expect((await call({entity:'Trip',operation:'get',id:'private'})).status).toBe(404);
 });

 it('lets only dispatch make, change or share jobs',async()=>{
  const {sdk,call}=setup();
  sdk.tables.Trip=[{id:'shared',company_id:'a',vehicle_id:'bus-a',job_type:'airport_pickup',status:'scheduled',shared_with_company:true}];
  expect((await call({entity:'Trip',operation:'update',id:'shared',data:{status:'completed'}})).status).toBe(403);
  expect((await call({entity:'Trip',operation:'delete',id:'shared'})).status).toBe(403);
  expect((await call({entity:'Trip',operation:'create',data:{vehicle_id:'bus-a',job_type:'transfer',status:'scheduled'}})).status).toBe(403);
  expect((await call({entity:'Trip',operation:'create',data:{vehicle_id:'bus-a',status:'scheduled',shared_with_company:true}})).status).toBe(403);
  expect(sdk.tables.Trip[0].status).toBe('scheduled');
 });

 it('an administrator can share a job',async()=>{
  const {sdk,call}=setup('admin');
  sdk.tables.Trip=[{id:'j',company_id:'a',vehicle_id:'bus-a',job_type:'airport_pickup',status:'scheduled'}];
  const res=await call({entity:'Trip',operation:'update',id:'j',data:{shared_with_company:true}});
  expect(res.status).toBe(200);
  expect(sdk.tables.Trip[0].shared_with_company).toBe(true);
 });
});
