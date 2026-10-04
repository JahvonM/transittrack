// Production criteria: normal assertions, no skips or expected-failure masking.
// Run separately with npm run test:security:release. Current failures block release.
import {describe,it,expect} from 'vitest';
import {webcrypto} from 'node:crypto';
import {load,mock,request,tablet,digest,interleaveReads} from './helpers';
describe('production security readiness',()=>{
 for(const name of ['companyAccess','generateOneTimeCode','kioskCheckIn','driverSession']) it(name+' accepts at most five attempts in a concurrent burst',async()=>{
  const sdk=mock(),{reserveAttempt}=load(name,sdk,['reserveAttempt']);
  const decisions=await Promise.all(Array.from({length:20},()=>reserveAttempt(sdk,'burst',5,60000)));
  expect(decisions.filter(Boolean).length).toBeLessThanOrEqual(5);
 });
 for(const name of ['kioskHeartbeat','kioskCheckIn','driverSession']) it(name+' rejects tokenless legacy IDs before production',async()=>{
  const sdk=mock(),{authenticatedTablet}=load(name,sdk,['authenticatedTablet']);
  expect(await authenticatedTablet(sdk,tablet)).toBe(false);
 });
 it('accepts exactly one concurrent pairing request',async()=>{
  const sdk=mock(null);Object.assign(sdk.tables.KioskDevice[0],{paired:false,pairing_expires_at:new Date(Date.now()+60000).toISOString()});
  const pair=load('pairKioskDevice',sdk).default;
  const responses=await Promise.all(Array.from({length:5},()=>pair(request({pairing_code:tablet.pairing_code}))));
  expect(responses.filter(r=>r.status===200)).toHaveLength(1);
  expect(sdk.tables.DeviceCredential).toHaveLength(1);
 });
 it('rejects pairing codes without an expiry',async()=>{
  const sdk=mock(null);Object.assign(sdk.tables.KioskDevice[0],{paired:false,pairing_code:'PAIR12345678'});
  const response=await load('pairKioskDevice',sdk).default(request({pairing_code:'PAIR12345678'}));
  expect(response.status).toBeGreaterThanOrEqual(400);
  expect(sdk.tables.DeviceCredential||[]).toHaveLength(0);
 });
 it('rejects manager writes to pairing security fields',async()=>{
  const sdk=mock('company');
  const response=await load('entityAccess',sdk).default(request({entity:'KioskDevice',operation:'update',id:'tablet',data:{pairing_code:'PAIR12345678',paired:false,pairing_expires_at:null}}));
  expect(response.status).toBe(403);
 });
 it('rejects weak manager-supplied company join codes',async()=>{
  const sdk=mock('company');
  const response=await load('entityAccess',sdk).default(request({entity:'Company',operation:'update',id:'a',data:{access_code:'ABCD'}}));
  expect(response.status).toBeGreaterThanOrEqual(400);
 });
 function codeClient() {
  const sdk=mock('admin');sdk.tables.Contact=[];
  sdk.tables.User.push({id:'passenger',role:'staff',email:'passenger@test.invalid'});
  sdk.tables.CompanyMembership.push({id:'approved',user_id:'passenger',company_id:'a',scope:'passenger',active:true});
  return sdk;
 }
 it('issues permanent keypad codes with at least ten characters',async()=>{
  const sdk=codeClient();
  const response=await load('kioskCheckIn',sdk).default(request({action:'generate_access_code',company_id:'a',staff_id:'passenger'}));
  expect(response.status).toBe(200);
  expect((await response.json()).code.length).toBeGreaterThanOrEqual(10);
 });
 it('does not issue a code already held in PassengerAccessCredential',async()=>{
  const sdk=codeClient();sdk.tables.PassengerAccessCredential=[{id:'held',user_id:'other',company_id:'a',token_hash:digest('777777777777')}];
  const fixedRandom={subtle:webcrypto.subtle,getRandomValues:array=>array.fill(7)};
  const response=await load('kioskCheckIn',sdk,[],fixedRandom).default(request({action:'generate_access_code',company_id:'a',staff_id:'passenger'}));
  if(response.status===200)expect((await response.json()).code).not.toBe('777777777777');
  else expect(response.status).toBe(503);
 });
 it('consumes one-time passenger codes only once under concurrency',async()=>{
  const sdk=mock(null);sdk.tables.User[0].role='staff';
  sdk.tables.PassengerOneTimeCredential=[{id:'otp',user_id:'caller',company_id:'a',token_hash:digest('987654'),expires_at:new Date(Date.now()+60000).toISOString()}];
  interleaveReads(sdk,'PassengerOneTimeCredential',5);
  const handler=load('kioskCheckIn',sdk).default;
  const responses=await Promise.all(Array.from({length:5},()=>handler(request({device_id:'tablet',action:'lookup_code',code:'987654'}))));
  expect(responses.filter(r=>r.status===200)).toHaveLength(1);
 });
 it('allows a boarding grant to authorize only one new request',async()=>{
  const sdk=mock(null),api=load('kioskCheckIn',sdk,['issueGrant']);
  const grant=await api.issueGrant(sdk,tablet,'boarding','rider',60000);
  const body={device_id:'tablet',action:'check_in',staff_id:'rider',method:'nfc',status:'boarded',verification_grant:grant,client_request_id:'first-123',occurred_at:new Date().toISOString()};
  expect((await api.default(request(body))).status).toBe(200);
  expect((await api.default(request({...body,client_request_id:'second-123',status:'off_board'}))).status).toBe(403);
 });
 it('rejects a revoked card even with an earlier boarding grant',async()=>{
  const sdk=mock(null);sdk.tables.Contact[0].nfc_card_tag='';
  sdk.tables.NfcCard=[{id:'card',company_id:'a',holder_source:'user',holder_id:'caller',card_uid:'CARD',is_active:true}];
  const api=load('kioskCheckIn',sdk);
  const lookup=await api.default(request({device_id:'tablet',action:'lookup_tag',card_tag:'CARD'}));
  expect(lookup.status).toBe(200);const data=await lookup.json();
  sdk.tables.NfcCard[0].is_active=false;
  const saved=await api.default(request({device_id:'tablet',action:'check_in',staff_id:'rider',method:'nfc',status:'boarded',verification_grant:data.verification_grant,client_request_id:'revoked-123',occurred_at:new Date().toISOString()}));
  expect(saved.status).toBe(403);
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
 it('creates one mechanic inspection row for concurrent identical replay IDs',async()=>{
  const sdk=mock('mechanic');interleaveReads(sdk,'InspectionResult',5);const handler=load('entityAccess',sdk).default;
  const body={entity:'InspectionResult',operation:'create',data:{vehicle_id:'bus-a',company_id:'a',inspection_item:'Tyre',condition:'GOOD',client_request_id:'same-result-123'}};
  const responses=await Promise.all(Array.from({length:5},()=>handler(request(body))));
  expect(responses.every(r=>r.status===200)).toBe(true);
  expect(sdk.tables.InspectionResult).toHaveLength(1);
 });
});
