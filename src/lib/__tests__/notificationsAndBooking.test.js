import {describe,it,expect} from 'vitest';
import {load,mock,request,digest} from '../../../security-tests/helpers';

function notificationFixture(role='staff',channel='staff',company='a') {
 const sdk=mock(role);
 sdk.tables.GroupMessage=[{id:'message',sender_id:'caller',vehicle_id:company==='a'?'bus-a':'bus-b',company_id:company,channel,text:'Saved message text'}];
 const handler=load('notifyAdminMessage',sdk,['notificationForMessage']);
 return {sdk,...handler};
}
for(const functionName of ['notifyAdminMessage','driverSession'])describe(functionName+' current push recipients',()=>{
 it('routes using current roles and approved scope, regardless of stale token metadata',async()=>{
  const sdk=mock('staff');
  sdk.tables.User.push({id:'admin',role:'admin',email:'admin@test.invalid'},{id:'manager-a',role:'company',email:'manager-a@test.invalid'},{id:'manager-b',role:'company',email:'manager-b@test.invalid'},{id:'mechanic',role:'mechanic',email:'mechanic@test.invalid'});
  sdk.tables.CompanyMembership.push({user_id:'manager-a',company_id:'a',scope:'manager',active:true},{user_id:'manager-b',company_id:'b',scope:'manager',active:true});
  sdk.tables.PushToken=[{email:'admin@test.invalid',role:'staff',token:'ADMIN'}, {email:'manager-a@test.invalid',company_id:'b',role:'mechanic',token:'MANAGER_A'}, {email:'manager-b@test.invalid',company_id:'a',role:'company',token:'MANAGER_B'}, {email:'mechanic@test.invalid',role:'company',token:'MECHANIC'}];
  const {pushTokensForChannel}=load(functionName,sdk,['pushTokensForChannel']);
  expect((await pushTokensForChannel(sdk,'company','a')).sort()).toEqual(['ADMIN','MANAGER_A']);
  expect((await pushTokensForChannel(sdk,'mechanic','b')).sort()).toEqual(['ADMIN','MECHANIC']);
  expect(await pushTokensForChannel(sdk,'dispatch','a')).toEqual(['ADMIN']);
 });
 it('excludes deleted, demoted and removed recipients',async()=>{
  const sdk=mock('staff');
  sdk.tables.User.push({id:'demoted',role:'staff',email:'demoted@test.invalid'},{id:'removed',role:'company',email:'removed@test.invalid'});
  sdk.tables.CompanyMembership.push({user_id:'removed',company_id:'a',scope:'manager',active:false});
  sdk.tables.PushToken=[{email:'deleted@test.invalid',role:'admin',token:'DELETED'}, {email:'demoted@test.invalid',role:'admin',token:'DEMOTED'}, {email:'removed@test.invalid',role:'company',company_id:'a',token:'REMOVED'}];
  const {pushTokensForChannel}=load(functionName,sdk,['pushTokensForChannel']);
  expect(await pushTokensForChannel(sdk,'company','a')).toEqual([]);
 });
 it('excludes expired and code-invalidated manager memberships',async()=>{
  const sdk=mock('company');
  sdk.tables.PushToken=[{email:'caller@test.invalid',role:'company',token:'MANAGER'}];
  const {pushTokensForChannel}=load(functionName,sdk,['pushTokensForChannel']);
  sdk.tables.CompanyMembership[0].expires_at=new Date(Date.now()-1000).toISOString();
  sdk.tables.CompanyMembership[0].code_hash=digest('JOIN12345678');
  expect(await pushTokensForChannel(sdk,'company','a')).toEqual([]);
  sdk.tables.CompanyMembership[0].expires_at=new Date(Date.now()+60000).toISOString();
  sdk.tables.Company[0].access_code='CHANGED_JOIN_CODE';
  expect(await pushTokensForChannel(sdk,'company','a')).toEqual([]);
 });
 it('fails closed if current user lookup is unavailable',async()=>{
  const sdk=mock('staff'),db=sdk.asServiceRole.entities;
  sdk.asServiceRole.entities=new Proxy(db,{get:(target,name)=>name==='User'?{...target[name],filter:async()=>{throw new Error('unavailable');}}:target[name]});
  const {pushTokensForChannel}=load(functionName,sdk,['pushTokensForChannel']);
  await expect(pushTokensForChannel(sdk,'dispatch','a')).rejects.toThrow('unavailable');
 });
});

describe('saved-message notification authorization',()=>{
 it('accepts own staff message and derives content from saved/server data',async()=>{
  const {sdk,default:handler,notificationForMessage}=notificationFixture();
  const body={message_id:'message',channel:'dispatch',company_id:'b',vehicle_name:'FORGED',sender_name:'FORGED',text:'FORGED'};
  expect((await handler(request(body))).status).toBe(200);
  const notification=await notificationForMessage(sdk,sdk.tables.User[0],body);
  expect(notification).toEqual({channel:'staff',companyId:'a',payload:{title:'Bus A · Caller',body:'Saved message text',data:{type:'group_message',channel:'staff'}}});
 });
 it('rejects fabricated notifications with no saved message ID',async()=>{
  const {sdk,default:handler}=notificationFixture();
  expect((await handler(request({text:'Invented',channel:'staff',company_id:'a'}))).status).toBe(400);
  expect(sdk.reads.some(r=>r.name==='GroupMessage')).toBe(false);
 });
 it('rejects notifying another sender\'s message',async()=>{
  const {sdk,default:handler}=notificationFixture();sdk.tables.GroupMessage[0].sender_id='someone-else';
  expect((await handler(request({message_id:'message'}))).status).toBe(403);
 });
 it('rejects removed membership even for an old own message',async()=>{
  const {sdk,default:handler}=notificationFixture();sdk.tables.CompanyMembership[0].active=false;
  expect((await handler(request({message_id:'message'}))).status).toBe(403);
 });
 it('rejects stored message/vehicle company mismatch',async()=>{
  const {sdk,default:handler}=notificationFixture('admin');sdk.tables.GroupMessage[0].company_id='b';
  expect((await handler(request({message_id:'message'}))).status).toBe(403);
 });
 it('denies passenger dispatch notifications with an otherwise owned record',async()=>{
  const {default:handler}=notificationFixture('passenger','dispatch');
  expect((await handler(request({message_id:'message'}))).status).toBe(403);
 });
 it('preserves global mechanic notification access on another company vehicle',async()=>{
  const {default:handler}=notificationFixture('mechanic','mechanic','b');
  expect((await handler(request({message_id:'message'}))).status).toBe(200);
 });
 it('allows an approved manager\'s own dispatch message',async()=>{
  const {default:handler}=notificationFixture('company','dispatch');
  expect((await handler(request({message_id:'message'}))).status).toBe(200);
 });
 it('ignores a cached privileged session role after demotion',async()=>{
  const {sdk,default:handler}=notificationFixture('staff','dispatch');
  sdk.auth.me=async()=>({id:'caller',role:'admin'});
  expect((await handler(request({message_id:'message'}))).status).toBe(403);
 });
 it('rejects anonymous calls before reading records',async()=>{
  const sdk=mock(null);expect((await load('notifyAdminMessage',sdk).default(request({message_id:'message'}))).status).toBe(401);
  expect(sdk.reads).toEqual([]);
 });
 it('maps SDK missing-record errors to controlled rejection',async()=>{
  const {sdk,default:handler}=notificationFixture(),db=sdk.asServiceRole.entities;
  sdk.asServiceRole.entities=new Proxy(db,{get:(target,name)=>name==='GroupMessage'?{...target[name],get:async()=>{throw Object.assign(new Error('missing'),{response:{status:404}});}}:target[name]});
  expect((await handler(request({message_id:'message'}))).status).toBe(404);
 });
 it('fails closed without exposing database errors when lookup fails',async()=>{
  const {sdk,default:handler}=notificationFixture(),db=sdk.asServiceRole.entities;
  sdk.asServiceRole.entities=new Proxy(db,{get:(target,name)=>name==='GroupMessage'?{...target[name],get:async()=>{throw new Error('PRIVATE_DATABASE_DETAIL');}}:target[name]});
  const response=await handler(request({message_id:'message'}));
  expect(response.status).toBe(500);expect(await response.json()).toEqual({error:'Notification failed'});
 });
 it('rejects deleted message IDs',async()=>{
  const {sdk,default:handler}=notificationFixture();sdk.tables.GroupMessage=[];
  expect((await handler(request({message_id:'message'}))).status).toBe(404);
 });
 for(const [type,label] of [['image','📷 Photo'],['audio','🎤 Voice note']])it('uses saved '+type+' metadata for a media notification',async()=>{
  const {sdk,notificationForMessage}=notificationFixture();Object.assign(sdk.tables.GroupMessage[0],{text:'',message_type:type,media_url:'https://example.invalid/media'});
  expect((await notificationForMessage(sdk,sdk.tables.User[0],{message_id:'message',text:'FORGED'})).payload.body).toBe(label);
 });
});

const booking={company_id:'b',passenger_name:'Test Rider',phone:'5550000',pickup_name:'A',dropoff_name:'B'};
function taxiFixture() {const sdk=mock('passenger');sdk.tables.Company[1].service_types=['taxi'];return {sdk,handler:load('bookTaxi',sdk).default};}
describe('taxi request validation',()=>{
 it('allows a signed-in non-member to book an actual public taxi operator',async()=>{
  const {sdk,handler}=taxiFixture();const response=await handler(request({...booking,pickup_lat:12,pickup_lng:-61}));
  expect(response.status).toBe(200);expect(sdk.tables.Trip[0]).toMatchObject({company_id:'b',pickup_lat:12,pickup_lng:-61,status:'scheduled'});
 });
 it('allows text-only pickup with absent coordinates',async()=>{
  const {sdk,handler}=taxiFixture();expect((await handler(request(booking))).status).toBe(200);
  expect(sdk.tables.Trip[0]).toMatchObject({pickup_lat:null,pickup_lng:null});
 });
 it('lists only taxi operator public fields',async()=>{
  const {handler}=taxiFixture();const response=await handler(request({action:'list'}));
  expect(await response.json()).toEqual({companies:[{id:'b',name:'B',phone:null}]});
 });
 it('rejects unsigned booking before reading or creating data',async()=>{
  const sdk=mock(null);expect((await load('bookTaxi',sdk).default(request(booking))).status).toBe(401);
  expect(sdk.reads).toEqual([]);expect(sdk.writes).toEqual([]);
 });
 for(const [name,changes] of [['latitude out of bounds',{pickup_lat:91,pickup_lng:0}],['longitude out of bounds',{pickup_lat:0,pickup_lng:181}],['unpaired coordinate',{pickup_lat:12}],['text coordinate',{pickup_lat:'12',pickup_lng:-61}],['null paired with number',{pickup_lat:null,pickup_lng:-61}],['unknown action',{action:'delete'}],['blank name',{passenger_name:'   '}],['object phone',{phone:{value:'555'}}]])it('rejects '+name+' before writing a trip',async()=>{
  const {sdk,handler}=taxiFixture();expect((await handler(request({...booking,...changes}))).status).toBe(400);expect(sdk.writes).toEqual([]);
 });
 it('rejects non-taxi company booking before writes',async()=>{
  const {sdk,handler}=taxiFixture();sdk.tables.Company[1].service_types=['staff_bus'];
  expect((await handler(request(booking))).status).toBe(403);expect(sdk.writes).toEqual([]);
 });
});
