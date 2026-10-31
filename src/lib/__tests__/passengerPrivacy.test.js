import {describe,it,expect} from 'vitest';
import {load,mock,request} from '../../../security-tests/helpers';

// A passenger sees their own rides and their company's staff runs, never
// other people's taps or dispatch jobs (hotel guests, website customers).

describe('passenger trips',()=>{
 it('hides dispatch jobs from passengers but keeps staff runs',async()=>{
  const sdk=mock('staff');
  sdk.tables.Trip=[
   {id:'run',company_id:'a',vehicle_id:'bus-a',status:'scheduled',pickup_name:'Grand Anse',dropoff_name:'Office'},
   {id:'job',company_id:'a',vehicle_id:'bus-a',job_type:'transfer',status:'scheduled',pickup_name:'Private villa',dropoff_name:'Airport'},
  ];
  const res=await load('entityAccess',sdk).default(request({entity:'Trip',operation:'list'}));
  const body=await res.json();
  expect(body.result.map(t=>t.id)).toEqual(['run']);
  expect(JSON.stringify(body)).not.toContain('Private villa');
  expect((await load('entityAccess',sdk).default(request({entity:'Trip',operation:'get',id:'job'}))).status).toBe(404);
 });
});

describe('My rides',()=>{
 function fixture(){
  const c=mock('staff');
  const day=(n)=>new Date(Date.now()-n*86400_000).toISOString();
  c.tables.NfcCard=[{id:'own',company_id:'a',holder_source:'contact',holder_id:'rider',card_uid:'CARD',is_active:true},{id:'other',company_id:'a',holder_source:'user',holder_id:'someone',card_uid:'OTHER',is_active:true}];
  c.tables.StaffCheckIn=[
   {id:'in',company_id:'a',card_tag:'CARD',status:'boarded',vehicle_name:'Bus A',boarded_at:day(2)},
   {id:'out',company_id:'a',card_tag:'CARD',status:'off_board',vehicle_name:'Bus A',boarded_at:day(2)},
   {id:'old',company_id:'a',card_tag:'CARD',status:'boarded',vehicle_name:'Bus A',boarded_at:day(90)},
   {id:'theirs',company_id:'a',card_tag:'OTHER',status:'boarded',vehicle_name:'Bus A',boarded_at:day(1)},
   {id:'foreign',company_id:'b',card_tag:'CARD',status:'boarded',vehicle_name:'Bus B',boarded_at:day(1)},
  ];
  return c;
 }
 it('returns only the passenger\'s own taps from the last 60 days, without card numbers',async()=>{
  const c=fixture(),res=await load('passengerAccount',c).default(request({action:'rides'}));
  expect(res.status).toBe(200);
  const data=await res.json();
  expect(data.events.map(e=>e.id).sort()).toEqual(['in','out']);
  // Only these fields ever leave the server for a ride.
  for(const e of data.events)expect(Object.keys(e).every(k=>['boarded_at','id','method','status','vehicle_name'].includes(k))).toBe(true);
  expect(JSON.stringify(data)).not.toContain('CARD');
  expect(c.writes).toEqual([]);
 });
 it('is for passengers only and not rate-limited like reports',async()=>{
  for(const role of ['driver','company','mechanic'])expect((await load('passengerAccount',mock(role)).default(request({action:'rides'}))).status).toBe(403);
  const c=fixture(),fn=load('passengerAccount',c).default;
  for(let i=0;i<5;i++)expect((await fn(request({action:'rides'}))).status).toBe(200);
 });
});
