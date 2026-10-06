import {beforeEach,describe,it,expect,vi} from 'vitest';
import {load,mock,request,interleaveReads} from './helpers';
import {installMemoryStorage} from '../src/lib/__tests__/memoryStorage';
import {enqueueCheckIn,flushQueue,queueLength} from '../src/lib/offlineQueue';
import {flushGpsQueue,queuedGpsCount} from '../src/lib/gpsQueue';
import {enqueueJob,registerRunner,flushJobs,pendingJobs} from '../src/lib/offlineJobs';
import {shiftAction} from '../src/lib/driverShift';
vi.mock('@/lib/reportError',()=>({reportError:vi.fn()}));
vi.mock('@/hooks/useDriverSession',()=>({patchDriverSession:vi.fn()}));
beforeEach(()=>installMemoryStorage());
const failure=status=>Object.assign(new Error('rejected'),{response:{status}});
async function driver() {
 const sdk=mock(null);sdk.tables.KioskDevice[0].kiosk_type='driver';
 const api=load('driverSession',sdk,['issueGrant']);
 const grant=await api.issueGrant(sdk,sdk.tables.KioskDevice[0],'driver','bus-a',60000);
 return {sdk,send:body=>api.default(request({device_id:'tablet',driver_grant:grant,...body}))};
}
describe('Step 6 independent-review production criteria',()=>{
 it('B1 quarantines an expired boarding action and continues independent fresh work',async()=>{
  enqueueCheckIn({staff_id:'expired',status:'boarded'});enqueueCheckIn({staff_id:'fresh',status:'boarded'});
  const send=vi.fn(async(_action,payload)=>{if(payload.staff_id==='expired')throw failure(403);return {};});
  expect(await flushQueue(send)).toBe(1);
  expect(send.mock.calls.some(([,payload])=>payload.staff_id==='fresh')).toBe(true);
  // Rejected work must remain recoverable, rather than silently discarded.
  expect(queueLength()).toBeGreaterThanOrEqual(1);
 });
 it('B1 does not let a rejected job block unrelated work on another vehicle',async()=>{
  enqueueJob('review-job',{vehicle_id:'old-bus'},'Old');enqueueJob('review-job',{vehicle_id:'new-bus'},'New');
  registerRunner('review-job',async payload=>{if(payload.vehicle_id==='old-bus')throw failure(409);});
  expect(await flushJobs()).toBe(1);expect(pendingJobs().length).toBeGreaterThanOrEqual(1);
 });
 it('B1 uploads fresh GPS despite an expired point in the saved batch',async()=>{
  const old={t:new Date(Date.now()-73*3600000).toISOString(),lat:18,lng:-76,speed:0};
  const fresh={...old,t:new Date().toISOString()};
  localStorage.setItem('tt_gps_queue',JSON.stringify([old,fresh]));
  const send=vi.fn(async(_action,payload)=>{if(payload.points.some(p=>Date.parse(p.t)<Date.now()-72*3600000))throw failure(400);return {ok:true};});
  expect(await flushGpsQueue(send)).toBe(1);
  expect(queuedGpsCount()).toBeGreaterThanOrEqual(1);
 });
 it('B2 never closes a newer shift opened on another tablet for an old named end request',async()=>{
  const {sdk,send}=await driver();
  sdk.tables.DriverShift=[
   {id:'A',company_id:'a',vehicle_id:'bus-a',device_id:'tablet',started_at:new Date(Date.now()-6*3600000).toISOString(),ended_at:new Date(Date.now()-5*3600000).toISOString()},
   {id:'B',company_id:'a',vehicle_id:'bus-a',device_id:'another-tablet',started_at:new Date(Date.now()-3600000).toISOString()},
  ];
  await send({action:'end_shift',shift_id:'A',client_request_id:'unsent-old-end',occurred_at:new Date(Date.now()-4*3600000).toISOString()});
  expect(sdk.tables.DriverShift.find(s=>s.id==='B').ended_at).toBeUndefined();
 });
 it('B4 retains inspection photo failures instead of acknowledging completion',async()=>{
  const {sdk,send}=await driver();sdk.tables.InspectionTemplate=[{id:'daily',company_id:'a',name:'Daily',audience:'driver'}];
  sdk.asServiceRole.integrations.Core.UploadFile=async()=>{throw new Error('upload unavailable');};
  const response=await send({action:'submit_template_inspection',client_request_id:'photo-failure',template_id:'daily',results:[{item_name:'Tyre',condition:'FAILED',photo_data:'aGVsbG8='}]});
  expect(response.status).toBe(503);
 });
 it('B4 rejects oversized photos instead of silently dropping them',async()=>{
  const {sdk,send}=await driver();sdk.tables.InspectionTemplate=[{id:'daily',company_id:'a',name:'Daily',audience:'driver'}];
  const response=await send({action:'submit_template_inspection',client_request_id:'photo-too-large',template_id:'daily',results:[{item_name:'Tyre',condition:'FAILED',photo_data:'a'.repeat(3000001)}]});
  expect(response.status).toBeGreaterThanOrEqual(400);
 });
 it('persists a new shift request before its first network call',async()=>{
  localStorage.setItem('tt_driver_device_id','tablet');
  let storedAtSend=[];
  await shiftAction(async()=>{storedAtSend=structuredClone(pendingJobs());throw new Error('connection lost');},'start_shift');
  expect(storedAtSend.some(job=>job.payload.client_request_id && job.payload.action==='start_shift')).toBe(true);
 });
 it('does not reinterpret an unbound legacy shift on a newly assigned bus',async()=>{
  const {sdk}=await driver();sdk.tables.KioskDevice[0].pairing_code='NEWPAIRING';
  // Re-unlock under the new pairing, then attempt a legacy queued payload with no assignment.
  const api=load('driverSession',sdk,['issueGrant']);
  const grant=await api.issueGrant(sdk,sdk.tables.KioskDevice[0],'driver','bus-a',60000);
  const response=await api.default(request({device_id:'tablet',driver_grant:grant,action:'start_shift',queue_replay:true,client_request_id:'legacy-unbound',occurred_at:new Date().toISOString()}));
  expect(response.status).toBe(409);
  expect(sdk.tables.DriverShift||[]).toHaveLength(0);
 });
 it('returns a controlled client rejection for admin assignment metadata without a tablet',async()=>{
  const sdk=mock('admin');
  const response=await load('kioskCheckIn',sdk).default(request({company_id:'a',action:'search_staff',query:'C',expected_device_id:'tablet'}));
  expect(response.status).toBeGreaterThanOrEqual(400);expect(response.status).toBeLessThan(500);
 });
 it('bounds GPS duplicate reads to the relevant time range rather than all historical records',async()=>{
  const {sdk,send}=await driver();
  sdk.tables.LocationPing=Array.from({length:6000},(_,i)=>({id:'old-'+i,company_id:'a',vehicle_id:'bus-a',recorded_at:new Date(Date.now()-10*86400000+i*60000).toISOString(),lat:18,lng:-76}));
  expect((await send({action:'upload_track',points:[{t:new Date().toISOString(),lat:18,lng:-76,speed:0}]})).status).toBe(200);
  expect(sdk.reads.filter(read=>read.name==='LocationPing').length).toBeLessThanOrEqual(2);
 });
 it('B3 creates one check-in under interleaved identical requests',async()=>{
  const sdk=mock(null),api=load('kioskCheckIn',sdk,['issueGrant']);
  const lookup=await api.default(request({device_id:'tablet',action:'lookup_tag',card_tag:'CARD'}));
  expect(lookup.status).toBe(200);const {verification_grant:grant}=await lookup.json();
  interleaveReads(sdk,'StaffCheckIn',2);
  const body={device_id:'tablet',action:'check_in',client_request_id:'concurrent-boarding',staff_id:'rider',method:'nfc',status:'boarded',verification_grant:grant,occurred_at:new Date().toISOString()};
  // The two later summary reads also complete as a pair.
  const responses=await Promise.all([api.default(request(body)),api.default(request(body))]);
  expect(responses.every(r=>r.status===200)).toBe(true);
  expect(sdk.tables.StaffCheckIn).toHaveLength(1);
 });
 it('B3 creates one shift under interleaved identical requests',async()=>{
  const {sdk,send}=await driver();interleaveReads(sdk,'DriverShift',2);
  const body={action:'start_shift',client_request_id:'concurrent-shift',occurred_at:new Date().toISOString()};
  const responses=await Promise.all([send(body),send(body)]);
  expect(responses.every(r=>r.status===200)).toBe(true);expect(sdk.tables.DriverShift).toHaveLength(1);
 });
 it('B3 creates one inspection parent under interleaved identical submissions',async()=>{
  const {sdk,send}=await driver();interleaveReads(sdk,'Inspection',2);
  const body={action:'submit_inspection',client_request_id:'concurrent-inspection',status:'passed'};
  const responses=await Promise.all([send(body),send(body)]);
  expect(responses.every(r=>r.status===200)).toBe(true);expect(sdk.tables.Inspection).toHaveLength(1);
 });
 it('B3 cannot overwrite newer GPS when old/new requests read the same prior position',async()=>{
  const {sdk,send}=await driver(),original=sdk.asServiceRole.entities;
  const older=new Date(Date.now()-120000).toISOString(),newer=new Date(Date.now()-30000).toISOString();
  sdk.tables.Vehicle[0].last_location_update=new Date(Date.now()-240000).toISOString();
  let releaseNewer;const newerSaved=new Promise(resolve=>{releaseNewer=resolve;});
  let reads=[];
  sdk.asServiceRole.entities=new Proxy(original,{get:(target,name)=>{
   const table=target[name];if(name!=='Vehicle')return table;
   return {...table,get:async id=>{
    const snapshot=await table.get(id);
    return new Promise(resolve=>{reads.push({resolve,snapshot});if(reads.length===2){for(const read of reads)read.resolve(read.snapshot);reads=[];}});
   },update:async(id,data)=>{
    if(data.last_location_update===older)await newerSaved;
    const result=await table.update(id,data);
    if(data.last_location_update===newer)releaseNewer();
    return result;
   }};
  }});
  const responses=await Promise.all([send({action:'update_location',lat:18,lng:-76,speed:0,recorded_at:older}),send({action:'update_location',lat:19,lng:-76,speed:0,recorded_at:newer})]);
  expect(responses.every(r=>r.status===200)).toBe(true);
  expect(sdk.tables.Vehicle[0].last_location_update).toBe(newer);
 });
});
