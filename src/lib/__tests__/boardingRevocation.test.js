
import {describe,it,expect} from 'vitest';
import {load,mock,request,digest} from '../../../security-tests/helpers.js';
function setup(){
 const sdk=mock(null);sdk.tables.User[0].role='staff';
 sdk.tables.NfcCard=[{id:'card',company_id:'a',holder_source:'contact',holder_id:'rider',card_uid:'CARD',is_active:true}];
 const api=load('kioskCheckIn',sdk,['issueGrant']);
 const send=body=>api.default(request({device_id:'tablet',...body}));
 return {sdk,api,send};
}
async function lookedUp(fixture){
 const response=await fixture.send({action:'lookup_tag',card_tag:'CARD'});expect(response.status).toBe(200);
 return (await response.json()).verification_grant;
}
const check=grant=>({action:'check_in',staff_id:'rider',method:'nfc',status:'boarded',verification_grant:grant,client_request_id:'boarding-1234',occurred_at:new Date().toISOString()});
describe('boarding grant current authorization',()=>{
 it.each([
 ['revoked ledger',sdk=>{sdk.tables.NfcCard[0].is_active=false;}],
 ['revoked timestamp',sdk=>{sdk.tables.NfcCard[0].revoked_at=new Date().toISOString();}],
 ['expired card',sdk=>{sdk.tables.NfcCard[0].expiry_date='2000-01-01';}],
 ['invalid expiry',sdk=>{sdk.tables.NfcCard[0].expiry_date='bad-date';}],
 ['different owner',sdk=>{sdk.tables.NfcCard[0].holder_id='someone-else';}],
 ['different company',sdk=>{sdk.tables.NfcCard[0].company_id='b';}],
 ['removed membership',sdk=>{sdk.tables.CompanyMembership[0].active=false;}],
 ['expired membership',sdk=>{sdk.tables.CompanyMembership[0].expires_at='2000-01-01';sdk.tables.CompanyMembership[0].code_hash=digest('JOIN12345678');}],
 ['changed role',sdk=>{sdk.tables.User[0].role='company';}],
 ['changed assignment',sdk=>{sdk.tables.Contact[0].vehicle_id='bus-b';}],
 ])('rejects a new check-in after %s without writing',async(_,change)=>{
  const f=setup(),grant=await lookedUp(f);const before=f.sdk.writes.length;change(f.sdk);
  expect((await f.send(check(grant))).status).toBe(403);expect(f.sdk.tables.StaffCheckIn||[]).toEqual([]);expect(f.sdk.writes.length).toBe(before);
 });
 it('rejects a known revoked card even if its UID remains copied on Contact',async()=>{
  const f=setup();f.sdk.tables.NfcCard[0].is_active=false;
  expect((await f.send({action:'lookup_tag',card_tag:'CARD'})).status).toBe(403);expect(f.sdk.tables.VerificationGrant||[]).toEqual([]);
 });
 it('rejects an old grant after the rider receives a different active card',async()=>{
  const f=setup(),grant=await lookedUp(f);
  f.sdk.tables.NfcCard[0].is_active=false;f.sdk.tables.Contact[0].nfc_card_tag='NEWCARD';
  f.sdk.tables.NfcCard.push({id:'replacement',company_id:'a',holder_source:'contact',holder_id:'rider',card_uid:'NEWCARD',is_active:true});
  expect((await f.send(check(grant))).status).toBe(403);
  const lookup=await f.send({action:'lookup_tag',card_tag:'NEWCARD'});expect(lookup.status).toBe(200);
  const fresh=(await lookup.json()).verification_grant;expect((await f.send(check(fresh))).status).toBe(200);
 });
 it('rejects an unbound older grant for a new check-in',async()=>{
  const f=setup(),grant=await f.api.issueGrant(f.sdk,f.sdk.tables.KioskDevice[0],'boarding','rider',60000);
  expect((await f.send(check(grant))).status).toBe(403);expect(f.sdk.tables.StaffCheckIn||[]).toEqual([]);
 });
 it('keeps completed retries safe after revocation',async()=>{
  const f=setup(),grant=await lookedUp(f),body=check(grant);
  expect((await f.send(body)).status).toBe(200);f.sdk.tables.NfcCard[0].is_active=false;f.sdk.tables.CompanyMembership[0].active=false;
  const again=await f.send(body);expect(again.status).toBe(200);expect((await again.json()).deduplicated).toBe(true);expect(f.sdk.tables.StaffCheckIn).toHaveLength(1);
 });
 it('binds card grants to the verification method',async()=>{
  const f=setup(),grant=await lookedUp(f);expect((await f.send({...check(grant),method:'code'})).status).toBe(403);
 });
 it('does not return grant identity or card fingerprint to the tablet',async()=>{
  const f=setup();const response=await f.send({action:'lookup_tag',card_tag:'CARD'});const data=await response.json();
  expect(Object.keys(data).sort()).toEqual(['next_status','staff','verification_grant']);
  expect(JSON.stringify(data)).not.toContain(digest('CARD'));expect(JSON.stringify(data)).not.toContain('member_user_id');
 });
});
