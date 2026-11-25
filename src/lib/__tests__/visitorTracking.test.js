import {describe,it,expect,vi} from 'vitest';
vi.mock('npm:@base44/sdk@0.8.57',()=>({createClientFromRequest:vi.fn()}));
vi.mock('../../../base44/shared/atomicOps.ts',()=>({reserveAttempt:vi.fn()}));
import {visitorView} from '../../../base44/functions/visitorTracking/entry.ts';
const now=Date.now();
const trip={status:'on_the_way',pickup_name:'Airport',dropoff_name:'Hotel',passenger_phone:'secret',passenger_name:'private',notes:'private'};
const vehicle={name:'Bus 1',company_id:'a',current_lat:12.03,current_lng:-61.77,last_location_update:new Date(now).toISOString(),driver_pin:'1234'};
describe('visitor tracking privacy',()=>{
 it('returns only this ride public fields and a fresh location',()=>{const result=visitorView(trip,vehicle,now);expect(result.location.lat).toBe(12.03);for(const key of ['passenger_phone','passenger_name','notes','driver_pin','company_id'])expect(result).not.toHaveProperty(key);});
 it('never shares locations for completed, cancelled, scheduled, stale or invalid GPS',()=>{for(const status of ['completed','cancelled','scheduled'])expect(visitorView({...trip,status},vehicle,now).location).toBeNull();expect(visitorView(trip,{...vehicle,last_location_update:new Date(now-180000).toISOString()},now).location_status).toBe('stale');expect(visitorView(trip,{...vehicle,current_lat:NaN},now).location).toBeNull();});
});
import handler from '../../../base44/functions/visitorTracking/entry.ts';
import {createClientFromRequest} from 'npm:@base44/sdk@0.8.57';
import {reserveAttempt} from '../../../base44/shared/atomicOps.ts';
const rawToken='a'.repeat(64);
async function call(body){return handler(new Request('https://test.invalid',{method:'POST',body:JSON.stringify(body)}));}
function setup(overrides={}){
 vi.mocked(reserveAttempt).mockResolvedValue(true);
 const grant={purpose:'visitor_tracking',subject:'trip1',company_id:'company1',vehicle_id:'bus1',expires_at:new Date(now+100000).toISOString(),...overrides};
 const db={VerificationGrant:{filter:vi.fn(async()=>[grant])},Trip:{get:vi.fn(async()=>({...trip,id:'trip1',company_id:'company1',vehicle_id:'bus1'}))},Vehicle:{get:vi.fn(async()=>({...vehicle,company_id:'company1'}))}};
 vi.mocked(createClientFromRequest).mockReturnValue({auth:{me:async()=>({role:'staff',id:'u'})},asServiceRole:{entities:db}});return db;
}
describe('visitor tracking authorization',()=>{
 it('rejects malformed tokens before any database lookup',async()=>{const db=setup();expect((await call({action:'track',token:'trip1'})).status).toBe(404);expect(db.VerificationGrant.filter).not.toHaveBeenCalled();});
 it('rejects expired links before looking up the trip',async()=>{const db=setup({expires_at:new Date(now-1000).toISOString()});expect((await call({action:'track',token:rawToken})).status).toBe(404);expect(db.Trip.get).not.toHaveBeenCalled();});
 it('invalidates links when dispatch reassigns the bus',async()=>{const db=setup();db.Trip.get.mockResolvedValue({...trip,company_id:'company1',vehicle_id:'different'});expect((await call({action:'track',token:rawToken})).status).toBe(404);expect(db.Vehicle.get).not.toHaveBeenCalled();});
 it('rejects other company vehicles and rate-limited readers',async()=>{const db=setup();db.Vehicle.get.mockResolvedValue({...vehicle,company_id:'other'});expect((await call({action:'track',token:rawToken})).status).toBe(404);vi.mocked(reserveAttempt).mockResolvedValue(false);expect((await call({action:'track',token:rawToken})).status).toBe(429);});
 it('allows only admins to issue tracking links',async()=>{setup();expect((await call({action:'issue',trip_id:'trip1'})).status).toBe(403);});
});
describe('arrival time: only the next stop of this ride, only while it is live',()=>{
 const placed={...trip,pickup_lat:12.0042,pickup_lng:-61.7861,dropoff_lat:12.0526,dropoff_lng:-61.7516};
 it('sends the pickup until the guest is on board, then the drop-off',()=>{
  expect(visitorView(placed,vehicle,now)).toMatchObject({stage:'to_pickup',eta:{to:'pickup',lat:12.0042,lng:-61.7861}});
  expect(visitorView({...placed,pickup_arrived_at:'x'},vehicle,now)).toMatchObject({stage:'at_pickup',eta:null});
  expect(visitorView({...placed,pickup_arrived_at:'x',pickup_signed_at:'y'},vehicle,now)).toMatchObject({stage:'to_dropoff',eta:{to:'dropoff',lat:12.0526,lng:-61.7516}});
  expect(visitorView({...placed,status:'arrived',pickup_signed_at:'y'},vehicle,now)).toMatchObject({stage:'at_dropoff',eta:null});
 });
 it('sends no stop without a live position, a placed stop, or an open ride',()=>{
  expect(visitorView(placed,{...vehicle,last_location_update:new Date(now-180000).toISOString()},now).eta).toBeNull();
  expect(visitorView(placed,{...vehicle,current_lat:NaN},now).eta).toBeNull();
  expect(visitorView(trip,vehicle,now).eta).toBeNull();
  expect(visitorView({...placed,pickup_lat:0,pickup_lng:0},vehicle,now).eta).toBeNull();
  for(const status of ['scheduled','completed','cancelled'])expect(visitorView({...placed,status},vehicle,now)).toMatchObject({eta:null});
 });
});
