import {describe,it,expect} from 'vitest';
import {load,mock,request} from './helpers.js';
function fixture(){
 const client=mock('staff');
 client.tables.NfcCard=[{id:'own',company_id:'a',holder_source:'contact',holder_id:'rider',card_uid:'CARD',is_active:true},{id:'other',company_id:'a',holder_source:'user',holder_id:'someone',card_uid:'OTHER',is_active:true}];
 client.tables.StaffCheckIn=[{id:'mine',company_id:'a',card_tag:'CARD',status:'boarded',vehicle_name:'Bus A',boarded_at:'2026-10-11T10:00:00Z'},{id:'other',company_id:'a',card_tag:'OTHER',status:'boarded'},{id:'foreign',company_id:'b',card_tag:'CARD',status:'boarded'}];
 return client;
}
describe('passenger account private data',()=>{
 it('returns only own company history and no NFC credentials',async()=>{
 const c=fixture(),response=await load('passengerAccount',c).default(request({action:'summary',user_id:'someone',company_id:'b'}));
 expect(response.status).toBe(200);const data=await response.json();
 expect(data.card).toEqual({issued:true,active:true,status:'Active'});
 expect(data.history.map(x=>x.id)).toEqual(['mine']);
 expect(JSON.stringify(data)).not.toContain('CARD');expect(c.writes).toEqual([]);
 });
 it.each([null,'driver','mechanic','company'])('rejects unauthorized role %s',async role=>{
 const c=mock(role),response=await load('passengerAccount',c).default(request({}));
 expect(response.status).toBe(role?403:401);expect(c.writes).toEqual([]);
 });
 it('does not trust editable profile company_id',async()=>{
 const c=fixture();c.tables.CompanyMembership=[];
 expect((await load('passengerAccount',c).default(request({}))).status).toBe(403);
 });
 it('disables only owned cards and privately reports the loss',async()=>{
 const c=fixture(),r=await load('passengerAccount',c).default(request({action:'report_lost_card',user_id:'someone'}));
 expect(r.status).toBe(200);expect(c.tables.NfcCard[0].is_active).toBe(false);expect(c.tables.NfcCard[1].is_active).toBe(true);
 expect(c.tables.LostItemReport[0].company_id).toBe('a');expect(JSON.stringify(await r.json())).not.toContain('CARD');
 });
 it('missed pickup derives company and vehicle server-side and limits repeats',async()=>{
 const c=fixture(),fn=load('passengerAccount',c).default;
 for(let i=0;i<3;i++)expect((await fn(request({action:'report_missed_pickup',vehicle_id:'bus-b',company_id:'b'}))).status).toBe(200);
 expect((await fn(request({action:'report_missed_pickup'}))).status).toBe(429);
 expect(c.tables.GroupMessage).toHaveLength(3);expect(c.tables.GroupMessage.every(x=>x.vehicle_id==='bus-a'&&x.company_id==='a')).toBe(true);
 });
 it('refuses a foreign assigned bus',async()=>{
 const c=fixture();c.tables.Contact[0].vehicle_id='bus-b';
 expect((await load('passengerAccount',c).default(request({action:'report_missed_pickup'}))).status).toBe(403);
 });
});
