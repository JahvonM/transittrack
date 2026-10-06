import {beforeEach,describe,it,expect,vi} from 'vitest';
import {load,mock,request} from '../../../security-tests/helpers';
import {installMemoryStorage} from '../__tests__/memoryStorage';
import {enqueueCheckIn,flushQueue,queueLength} from '../offlineQueue';
import {flushGpsQueue,queuedGpsCount} from '../gpsQueue';
import {enqueueJob,registerRunner,flushJobs,pendingJobs} from '../offlineJobs';
import {shiftAction} from '../driverShift';
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
 it('invalidates driver unlock grants when the PIN is reset',async()=>{
  const sdk=mock('admin');sdk.tables.KioskDevice[0].kiosk_type='driver';
  const api=load('driverSession',sdk,['issueGrant','validGrant']);
  const grant=await api.issueGrant(sdk,sdk.tables.KioskDevice[0],'driver','bus-a',60000);
  expect(await api.validGrant(sdk,sdk.tables.KioskDevice[0],grant,'driver','bus-a')).toBe(true);
  expect((await load('manageDriverPin',sdk).default(request({vehicle_id:'bus-a',pin:'5678'}))).status).toBe(200);
  expect(await api.validGrant(sdk,sdk.tables.KioskDevice[0],grant,'driver','bus-a')).toBe(false);
 });
 it('selects maintenance managers from approved memberships rather than profile company_id',async()=>{
  const sdk=mock('admin');
  sdk.tables.User.push({id:'manager',role:'company',company_id:'b',email:'manager@test.invalid'});
  sdk.tables.CompanyMembership.push({id:'manager-a',user_id:'manager',company_id:'a',scope:'manager',active:true});
  sdk.tables.MaintenanceSchedule=[{id:'schedule',company_id:'b',vehicle_id:'bus-b',vehicle_name:'Bus B',service_type:'Oil',due_type:'km',last_service_mileage:0,interval_km:1,status:'due'}];
  sdk.tables.Vehicle[1].current_odometer=100;
  expect((await load('maintenanceAlerts',sdk).default(request({}))).status).toBe(200);
  expect(sdk.emails.map(e=>e.to)).not.toContain('manager@test.invalid');
 });

});
