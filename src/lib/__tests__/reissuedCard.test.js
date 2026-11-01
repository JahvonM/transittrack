import {describe,it,expect} from 'vitest';
import {load,mock,request} from '../../../security-tests/helpers.js';

// A card that was cancelled and later issued again keeps its old record.
// The boarding tablet must accept it (one active record), and still refuse a
// card that two active records claim.
function setup(){
 const sdk=mock('admin');
 sdk.tables.Contact[0].nfc_card_tag='AABBCCDD';
 sdk.tables.NfcCard=[
  {id:'old',company_id:'a',holder_source:'contact',holder_id:'rider',card_uid:'AABBCCDD',is_active:false,revoked_at:'2026-10-28T10:00:00Z',revoke_reason:'Revoked by admin',updated_date:'2026-10-28T10:00:00Z'},
  {id:'new',company_id:'a',holder_source:'contact',holder_id:'rider',card_uid:'AABBCCDD',is_active:true,updated_date:'2026-10-28T11:00:00Z'},
 ];
 sdk.tables.StaffCheckIn=[];
 const handler=load('kioskCheckIn',sdk).default;
 const send=async body=>{const r=await handler(request({device_id:'tablet',...body}));return {status:r.status,body:await r.json()};};
 return {sdk,send};
}
describe('a card issued again after it was cancelled',()=>{
 it('is accepted by a tablet that is online',async()=>{
  const f=setup();
  const look=await f.send({action:'lookup_tag',card_tag:'AABBCCDD'});
  expect(look.status).toBe(200);
  expect(look.body.staff.id).toBe('rider');
 });
 it('is in the list a tablet saves for offline taps',async()=>{
  const f=setup();
  expect((await f.send({action:'offline_directory'})).body.staff.map(s=>s.id)).toContain('rider');
 });
 it('is still refused when two active records claim the same card',async()=>{
  const f=setup();
  f.sdk.tables.NfcCard[0].is_active=true;f.sdk.tables.NfcCard[0].revoked_at=null;
  expect((await f.send({action:'lookup_tag',card_tag:'AABBCCDD'})).status).toBe(403);
 });
});
