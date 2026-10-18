import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { load, mock, request } from '../../../security-tests/helpers.js';
const hash = s => createHash('sha256').update(s).digest('hex');
async function setup({ enrolled = true } = {}) {
 const sdk = mock(null), d = sdk.tables.KioskDevice[0]; d.kiosk_type = 'driver';
 sdk.tables.Vehicle[0].tracking_active = true;
 const token = 'a'.repeat(64);
 sdk.tables.DeviceCredential = enrolled ? [{ id:'dc', device_id:d.id, token_hash:hash(token), company_id:d.company_id, vehicle_id:d.vehicle_id,
  kiosk_type:d.kiosk_type, pairing_code_hash:hash(d.pairing_code), expires_at:'2099-01-01T00:00:00Z' }] : [];
 const api = load('driverSession', sdk, ['issueGrant']);
 const grant = await api.issueGrant(sdk,d,'driver',d.vehicle_id,3600000);
 const body = { device_id:d.id, device_token:token, driver_grant:grant, expected_device_id:d.id, expected_company_id:d.company_id, expected_vehicle_id:d.vehicle_id };
 sdk.writes.length=0;
 const send = async data => { const r=await api.default(request({...body,...data}));return { status:r.status, body:await r.json() }; };
 return {sdk,send,body};
}
describe('native background driver GPS authorization',()=>{
 it('returns only a tracking lease bound to a verified driver',async()=>{
  const {send,body}=await setup(); const r=await send({action:'background_check'});
  expect(r.status).toBe(200);expect(r.body.tracking).toBe(true);
  expect(Date.parse(r.body.expires_at)).toBeGreaterThan(Date.now());
  expect(Object.keys(r.body).sort()).toEqual(['expires_at','ok','server_time','tracking']);
  expect(JSON.stringify(r.body)).not.toContain(body.driver_grant);
 });
 it('does not authorize legacy ID-only tablets',async()=>{
  const {send,sdk}=await setup({enrolled:false});
  expect((await send({action:'background_check'})).status).toBe(403);expect(sdk.writes).toEqual([]);
 });
 it.each(['expected_device_id','expected_company_id','expected_vehicle_id'])('requires an explicit original %s',async key=>{
  const {send,sdk}=await setup();
  expect((await send({action:'background_check',[key]:undefined})).status).toBe(409);
  expect((await send({action:'background_location',[key]:'other',lat:12,lng:-61,speed:1})).status).toBe(409);
  expect(sdk.writes).toEqual([]);
 });
 it('stops a disabled tracking session without writing a location',async()=>{
  const {send,sdk}=await setup();sdk.tables.Vehicle[0].tracking_active=false;
  expect((await send({action:'background_location',lat:12,lng:-61,speed:1})).body).toEqual({ok:true,tracking:false});
  expect(sdk.writes).toEqual([]);
 });
 it('accepts valid current background samples through the existing location pipeline',async()=>{
  const {send,sdk}=await setup();
  const r=await send({action:'background_location',lat:12.05,lng:-61.75,speed:3,status:'on_trip',recorded_at:new Date().toISOString()});
  expect(r.status).toBe(200);expect(r.body.ok).toBe(true);
  expect(sdk.writes.some(w=>w.name==='Vehicle' && w.data?.current_lat===12.05)).toBe(true);
 });
 it('rejects an expired grant and a revoked device before any location write',async()=>{
  const {send,sdk}=await setup();sdk.tables.VerificationGrant[0].expires_at='2000-01-01T00:00:00Z';
  expect((await send({action:'background_check'})).status).toBe(401);
  sdk.tables.KioskDevice[0].status='revoked';
  expect((await send({action:'background_location',lat:12,lng:-61})).status).toBe(401);
  expect(sdk.writes).toEqual([]);
 });
 it('preserves the original bus/company for offline replay',async()=>{
  const {send,sdk}=await setup();
  const r=await send({action:'upload_track',native_background:true,queue_replay:true,points:[{expected_device_id:'tablet',expected_company_id:'a',expected_vehicle_id:'old-bus',lat:12,lng:-61,speed:0,t:new Date().toISOString()}]});
  expect(r.status).toBe(409);expect(sdk.writes).toEqual([]);
 });
});
