import { it, expect } from 'vitest';
import { webcrypto, pbkdf2Sync } from 'node:crypto';
import { load, mock, request } from '../../../security-tests/helpers.js';

const limitedCrypto = {
 getRandomValues: array => webcrypto.getRandomValues(array),
 subtle: {
  importKey: (...args) => webcrypto.subtle.importKey(...args),
  deriveBits: async () => { throw new Error('PBKDF2 unavailable in hosted WebCrypto'); },
 },
};
for (const name of ['manageDriverPin','driverSession']) {
 it(name + ' uses an equivalent protected hash when WebCrypto rejects PBKDF2', async()=>{
  const {pinHash}=load(name,mock('admin'),['pinHash'],limitedCrypto);
  const salt='fixed-test-salt';
  expect(await pinHash('0123',salt)).toBe(pbkdf2Sync('0123',salt,600000,32,'sha256').toString('hex'));
 });
}
it('saving a PIN still creates only a protected credential with limited WebCrypto',async()=>{
 const sdk=mock('admin');
 const handler=load('manageDriverPin',sdk,[],limitedCrypto).default;
 const res=await handler(request({vehicle_id:'bus-a',pin:'0123'}));
 expect(res.status).toBe(200);
 const row=sdk.tables.DriverPinCredential[0];
 expect(row.pin_hash).toBe(pbkdf2Sync('0123',row.salt,600000,32,'sha256').toString('hex'));
 expect(sdk.tables.Vehicle[0].driver_pin).toBe('');
 expect(row.enabled).toBe(true);
});

it('a paired locked tablet can request a scoped admin reset without changing its PIN',async()=>{
 const sdk=mock('admin'); sdk.tables.KioskDevice[0].kiosk_type='driver'; sdk.tables.DeviceCredential[0].kiosk_type='driver';
 const handler=load('driverSession',sdk).default;
 const res=await handler(request({device_id:'tablet',action:'request_pin_reset',company_id:'b',vehicle_name:'spoof'}));
 expect(res.status).toBe(200);
 expect(sdk.tables.Broadcast[0]).toMatchObject({company_id:'a',vehicle_name:'Bus A',is_reply:true,title:'Driver PIN reset requested'});
 expect(sdk.tables.Vehicle[0].driver_pin).toBe('1234');
 expect(sdk.tables.DriverPinCredential).toBeUndefined();
 expect((await handler(request({device_id:'tablet',action:'request_pin_reset'}))).status).toBe(429);
});
it('an unpaired tablet cannot request a reset',async()=>{
 const sdk=mock('admin'); sdk.tables.KioskDevice[0].paired=false;
 expect((await load('driverSession',sdk).default(request({device_id:'tablet',action:'request_pin_reset'}))).status).toBe(401);
 expect(sdk.tables.Broadcast).toBeUndefined();
});