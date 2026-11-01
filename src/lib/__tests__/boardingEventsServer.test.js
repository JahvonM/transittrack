import {describe,it,expect} from 'vitest';
import {load,mock,request} from '../../../security-tests/helpers.js';

// Boarding and exit taps as the server records them (kioskCheckIn), for the
// release scenarios: several riders leaving at different stops, repeated
// taps, cancelled cards tapped offline, two tablets out of step, two trips in
// a day, reader modes and trips that must be running.

const minAgo=(n)=>new Date(Date.now()-n*60_000).toISOString();
const ASSIGNED={expected_device_id:'tablet',expected_company_id:'a',expected_vehicle_id:'bus-a'};

function setup(){
 const sdk=mock('admin');
 sdk.tables.Contact[0].nfc_card_tag='AABBCCDD';
 sdk.tables.Contact.push({id:'rider2',company_id:'a',type:'staff',vehicle_id:'bus-a',name:'Second Rider',nfc_card_tag:'11223344'});
 sdk.tables.NfcCard=[
  {id:'c1',company_id:'a',holder_source:'contact',holder_id:'rider',card_uid:'AABBCCDD',is_active:true},
  {id:'c2',company_id:'a',holder_source:'contact',holder_id:'rider2',card_uid:'11223344',is_active:true},
 ];
 sdk.tables.StaffCheckIn=[];
 sdk.tables.DriverShift=[];
 const handler=load('kioskCheckIn',sdk).default;
 const send=async(body,device='tablet')=>{const r=await handler(request({device_id:device,...body}));return {status:r.status,body:await r.json()};};
 return {sdk,send};
}
let n=0;
// A tap as a tablet sends it, from the card list it downloaded.
const tap=(dir,id,status,minutesAgo,extra={})=>({action:'check_in',staff_id:id,method:'nfc',status,directory_grant:dir.directory_grant,
 card_fingerprint:dir.staff.find(s=>s.id===id).card_fingerprint,client_request_id:'request-'+(++n)+'-'+Date.now(),occurred_at:minAgo(minutesAgo),...ASSIGNED,...extra});
const records=(f)=>f.sdk.tables.StaffCheckIn;

describe('one trip, several riders',()=>{
 it('records each rider boarding and leaving at their own stop, with nothing to review',async()=>{
  const f=setup();const dir=(await f.send({action:'offline_directory'})).body;
  for(const [id,status,ago] of [['rider','boarded',60],['rider2','boarded',58],['rider','off_board',40],['rider2','off_board',20]])
   expect((await f.send(tap(dir,id,status,ago))).status).toBe(200);
  expect(records(f)).toHaveLength(4);
  expect(records(f).every(r=>!r.review_reason)).toBe(true);
  expect(new Set(records(f).map(r=>r.person_key))).toEqual(new Set(['contact:rider','contact:rider2']));
 });
});

describe('repeated taps',()=>{
 it('a second tap says already recorded and adds nothing',async()=>{
  const f=setup();const dir=(await f.send({action:'offline_directory'})).body;
  expect((await f.send(tap(dir,'rider','boarded',10))).body.duplicate).toBeUndefined();
  const again=await f.send(tap(dir,'rider','boarded',9));
  expect(again.status).toBe(200);expect(again.body.duplicate).toBe(true);
  expect(records(f)).toHaveLength(1);
 });
 it('a double tap is offered as already recorded, never suggested as getting off',async()=>{
  const f=setup();const dir=(await f.send({action:'offline_directory'})).body;
  await f.send(tap(dir,'rider','boarded',1));
  const look=(await f.send({action:'lookup_tag',card_tag:'AABBCCDD'})).body;
  expect(look.already).toMatchObject({status:'boarded'});
  expect(look.reader_mode).toBe('both');
 });
});

describe('cancelled cards tapped offline',()=>{
 it('a live tap of a cancelled card is refused',async()=>{
  const f=setup();const dir=(await f.send({action:'offline_directory'})).body;
  Object.assign(f.sdk.tables.NfcCard[0],{is_active:false,revoked_at:minAgo(30)});f.sdk.tables.Contact[0].nfc_card_tag='';
  const live=tap(dir,'rider','boarded',0);delete live.occurred_at;
  expect((await f.send(live)).status).toBe(403);
  expect(records(f)).toHaveLength(0);
 });
 it('an offline tap is kept and marked for review, saying whether the card was already cancelled',async()=>{
  const f=setup();const dir=(await f.send({action:'offline_directory'})).body;
  Object.assign(f.sdk.tables.NfcCard[0],{is_active:false,revoked_at:minAgo(30)});f.sdk.tables.Contact[0].nfc_card_tag='';
  expect((await f.send(tap(dir,'rider','boarded',20,{queue_replay:true}))).status).toBe(200);
  expect((await f.send(tap(dir,'rider','off_board',60*2,{queue_replay:true}))).status).toBe(200);
  const [after,before]=records(f);
  expect(after).toMatchObject({review_reason:'revoked_card_used_offline',saved_offline:true});
  expect(before.review_reason).toBe('card_changed_after_tap');
 });
});

describe('a card issued again after it was cancelled',()=>{
 // Live data on 31 Oct: all three active cards had older cancelled records
 // for the same card, and none had been tapped in since being issued again.
 function reissued(){
  const f=setup();
  f.sdk.tables.NfcCard.push({id:'c0',company_id:'a',holder_source:'contact',holder_id:'rider',card_uid:'AABBCCDD',is_active:false,revoked_at:minAgo(600),revoke_reason:'Replaced by a new card'});
  return f;
 }
 it('works on a tablet that is online',async()=>{
  const f=reissued();
  const look=await f.send({action:'lookup_tag',card_tag:'AABBCCDD'});
  expect(look.status).toBe(200);
  expect(look.body.staff.id).toBe('rider');
 });
 it('is in the list a tablet saves for offline taps',async()=>{
  const f=reissued();
  const dir=(await f.send({action:'offline_directory'})).body;
  expect(dir.staff.map(s=>s.id)).toContain('rider');
 });
 it('is still refused when two active records claim the same card',async()=>{
  const f=reissued();
  f.sdk.tables.NfcCard.push({id:'c9',company_id:'a',holder_source:'contact',holder_id:'rider2',card_uid:'AABBCCDD',is_active:true});
  expect((await f.send({action:'lookup_tag',card_tag:'AABBCCDD'})).status).toBe(403);
 });
});

describe('two tablets out of step',()=>{
 function second(f){f.sdk.tables.KioskDevice.push({...f.sdk.tables.KioskDevice[0],id:'tablet2'});}
 it('the same boarding from both tablets is recorded once, whichever arrives first',async()=>{
  const f=setup();second(f);
  const dirA=(await f.send({action:'offline_directory'})).body,dirB=(await f.send({action:'offline_directory'},'tablet2')).body;
  // Tablet B was online and sent its 7:05 boarding; tablet A's 7:00 one comes from its offline queue.
  expect((await f.send(tap(dirB,'rider','boarded',55,{expected_device_id:'tablet2'}),'tablet2')).status).toBe(200);
  const replay=await f.send(tap(dirA,'rider','boarded',60,{queue_replay:true}));
  expect(replay.body.duplicate).toBe(true);
  expect(records(f)).toHaveLength(1);
 });
 it('taps that disagree on order are kept and flagged',async()=>{
  const f=setup();second(f);
  const dirA=(await f.send({action:'offline_directory'})).body,dirB=(await f.send({action:'offline_directory'},'tablet2')).body;
  await f.send(tap(dirB,'rider','boarded',90,{expected_device_id:'tablet2'}),'tablet2');
  await f.send(tap(dirB,'rider','off_board',30,{expected_device_id:'tablet2'}),'tablet2');
  const late=await f.send(tap(dirA,'rider','off_board',80,{queue_replay:true}));
  expect(late.status).toBe(200);
  expect(records(f).at(-1)).toMatchObject({status:'off_board',review_reason:'conflicting_devices',saved_offline:true});
 });
});

describe('trips',()=>{
 it('two trips on the same bus in one day are separate runs',async()=>{
  const f=setup();const dir=(await f.send({action:'offline_directory'})).body;
  f.sdk.tables.DriverShift=[{id:'morning',vehicle_id:'bus-a',started_at:minAgo(600),ended_at:minAgo(480)},{id:'evening',vehicle_id:'bus-a',started_at:minAgo(120)}];
  for(const [status,ago] of [['boarded',590],['off_board',560],['boarded',100],['off_board',70]]) expect((await f.send(tap(dir,'rider',status,ago))).status).toBe(200);
  expect(records(f).map(r=>r.run_key)).toEqual(['shift:morning','shift:morning','shift:evening','shift:evening']);
  expect(records(f).every(r=>!r.review_reason)).toBe(true);
 });
 it('a tablet that needs a running trip says what to do, and works once the shift starts',async()=>{
  const f=setup();f.sdk.tables.KioskDevice[0].require_active_trip=true;
  const dir=(await f.send({action:'offline_directory'})).body;
  const refused=await f.send(tap(dir,'rider','boarded',1));
  expect(refused.status).toBe(409);expect(refused.body.error).toBe('no_active_trip');
  f.sdk.tables.DriverShift=[{id:'now',vehicle_id:'bus-a',started_at:minAgo(5)}];
  expect((await f.send(tap(dir,'rider','boarded',1))).status).toBe(200);
  expect(records(f)[0].run_key).toBe('shift:now');
 });
});

describe('reader modes',()=>{
 it('a boarding-only reader refuses an exit with a useful message, but keeps offline taps',async()=>{
  const f=setup();f.sdk.tables.KioskDevice[0].reader_mode='boarding';
  const dir=(await f.send({action:'offline_directory'})).body;
  const exit=await f.send(tap(dir,'rider','off_board',1));
  expect(exit.status).toBe(409);expect(exit.body.message).toMatch(/boarding only/);
  expect((await f.send(tap(dir,'rider','off_board',3,{queue_replay:true}))).status).toBe(200);
  const look=(await f.send({action:'lookup_tag',card_tag:'11223344'})).body;
  expect(look).toMatchObject({next_status:'boarded',reader_mode:'boarding',already:null});
 });
});
