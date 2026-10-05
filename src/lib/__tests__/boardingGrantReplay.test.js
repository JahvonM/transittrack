import {describe,it,expect} from 'vitest';
import {load,mock,request,digest} from '../../../security-tests/helpers';

async function fixture() {
 const sdk=mock(null),handler=load('kioskCheckIn',sdk).default;
 const lookup=await handler(request({device_id:'tablet',action:'lookup_tag',card_tag:'CARD'}));
 expect(lookup.status).toBe(200);
 const {verification_grant}=await lookup.json();
 const body={device_id:'tablet',action:'check_in',staff_id:'rider',method:'nfc',status:'boarded',verification_grant,client_request_id:'boarding-001',occurred_at:new Date().toISOString()};
 return {sdk,handler,body};
}
describe('boarding lookup grant sequential replay protection',()=>{
 it('returns the original record for identical retries and rejects a different request',async()=>{
  const {sdk,handler,body}=await fixture();
  const first=await handler(request(body));expect(first.status).toBe(200);
  const firstData=await first.json();
  const retry=await handler(request(body));expect(retry.status).toBe(200);
  const retryData=await retry.json();expect(retryData.deduplicated).toBe(true);
  expect(retryData.record.id).toBe(firstData.record.id);
  expect((await handler(request({...body,client_request_id:'boarding-002'}))).status).toBe(403);
  expect(sdk.tables.StaffCheckIn).toHaveLength(1);
  expect(sdk.tables.StaffCheckIn[0].boarding_grant_hash).toBe(digest(body.verification_grant));
  expect(firstData.record).not.toHaveProperty('boarding_grant_hash');
  expect(firstData.record).not.toHaveProperty('verification_grant');
 });
 it('keeps an authorization retryable after the check-in create fails',async()=>{
  const {sdk,handler,body}=await fixture(),original=sdk.asServiceRole.entities;
  let failOnce=true;
  sdk.asServiceRole.entities=new Proxy(original,{get:(target,name)=>{
   if(name!=='StaffCheckIn')return target[name];
   return {...target[name],create:async data=>{
    if(failOnce){failOnce=false;throw new Error('storage unavailable');}
    return target[name].create(data);
   }};
  }});
  expect((await handler(request(body))).status).toBe(500);
  expect(sdk.tables.StaffCheckIn||[]).toHaveLength(0);
  expect((await handler(request(body))).status).toBe(200);
  expect(sdk.tables.StaffCheckIn).toHaveLength(1);
 });
 it('requires a fresh tap for the next boarding event',async()=>{
  const {sdk,handler,body}=await fixture();
  expect((await handler(request(body))).status).toBe(200);
  const lookup=await handler(request({device_id:'tablet',action:'lookup_tag',card_tag:'CARD'}));
  const {verification_grant}=await lookup.json();
  expect((await handler(request({...body,verification_grant,client_request_id:'boarding-002',status:'off_board'}))).status).toBe(200);
  expect(sdk.tables.StaffCheckIn).toHaveLength(2);
 });
 it('does not consume a grant when a check-in timestamp is rejected',async()=>{
  const {handler,body}=await fixture();
  expect((await handler(request({...body,occurred_at:'invalid'}))).status).toBe(400);
  expect((await handler(request(body))).status).toBe(200);
 });
});
