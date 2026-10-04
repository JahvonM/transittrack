import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import ts from 'typescript';
import { createHash } from 'node:crypto';
function handler(name,client) {
 const source=fs.readFileSync(new URL(`../../../base44/functions/${name}/entry.ts`,import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'');
 const exports={};
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('exports','createClientFromRequest','secrets',js)(exports,()=>client,{get:()=>null});
 return exports.default;
}
function match(row,query) {
 return Object.entries(query).every(([key,value])=>{
  if(key==='$or') return value.some(q=>match(row,q));
  if(key==='$and') return value.every(q=>match(row,q));
  if(value && typeof value==='object') return value.$in ? value.$in.includes(row[key]) : value.$ne ? row[key]!==value.$ne : false;
  return row[key]===value;
 });
}
function sdk(role='company',approved=true) {
 const user={id:'caller',role,email:'caller@test.local',full_name:'Caller',company_id:'b',nfc_tag_id:'SENTINEL',access_code:'SENTINEL'};
 const tables={
  User:[user,{id:'other',role:'staff',company_id:'b',email:'other@test.local'}],
  CompanyMembership:approved?[{id:'membership',user_id:'caller',scope:role==='company'?'manager':'passenger',company_id:'a',active:true}]:[],
  Company:[{id:'a',name:'Company A',access_code:'SENTINEL'},{id:'b',name:'Company B',access_code:'SENTINEL'}],
  Vehicle:[{id:'bus-a',company_id:'a',name:'Bus A',driver_pin:'SENTINEL',entry_code:'SENTINEL',current_odometer:1},{id:'bus-b',company_id:'b',name:'Bus B',driver_pin:'SENTINEL'}],
  Fault:[{id:'fault-a',vehicle_id:'bus-a',company_id:'a',title:'Fault A'},{id:'fault-b',vehicle_id:'bus-b',company_id:'b',title:'Fault B'}],
  Part:[{id:'part-a',company_id:'a',part_name:'A'},{id:'part-b',company_id:'b',part_name:'B'}],
  Route:[{id:'route-a',company_id:'a',name:'Route A'},{id:'route-b',company_id:'b',name:'Route B'}],
  Advertisement:[{id:'ad',title:'Public ad',active:true}],
  GroupMessage:[{id:'message-a',company_id:'a',vehicle_id:'bus-a',channel:'staff',text:'Hello',sender_id:'other'},{id:'message-b',company_id:'b',channel:'staff',text:'Private B'}],
 };
 let writes=0;
 const entities=new Proxy({}, {get:(_,name)=>({
  get:async id=>(tables[name]||[]).find(r=>r.id===id),
  filter:async(query,_sort,limit,skip=0)=>(tables[name]||[]).filter(r=>match(r,query)).slice(skip,skip+(limit||1000)),
  list:async()=>tables[name]||[],
  create:async data=>{writes++;const row={id:'new-'+writes,...data};(tables[name]||=[]).push(row);return row;},
  update:async(id,data)=>{writes++;return Object.assign((tables[name]||[]).find(r=>r.id===id),data);},
  delete:async id=>{writes++;tables[name]=(tables[name]||[]).filter(r=>r.id!==id);},
 })});
 return {tables,writes:()=>writes,auth:{me:async()=>role?user:null},asServiceRole:{entities}};
}
const request=body=>new Request('https://test.local',{method:'POST',body:JSON.stringify(body)});
async function call(client,body) {
 const response=await handler('entityAccess',client)(request(body));
 return {status:response.status,data:await response.json()};
}
describe('company and role access boundaries',()=>{
 it('uses approved membership instead of a spoofed User.company_id',async()=>{
  const client=sdk();
  const response=await call(client,{entity:'Vehicle',operation:'list'});
  expect(response.status).toBe(200);
  expect(response.data.result.map(r=>r.id)).toEqual(['bus-a']);
  expect(JSON.stringify(response.data)).not.toContain('SENTINEL');
  const me=await call(client,{entity:'User',operation:'get',id:'me'});
  expect(me.data.result.company_id).toBe('a');
  expect(JSON.stringify(me.data)).not.toContain('SENTINEL');
 });
 it('does not trust a company profile without approved membership',async()=>{
  const client=sdk('company',false);
  expect((await call(client,{entity:'Vehicle',operation:'list'})).data.result).toEqual([]);
  expect((await call(client,{entity:'Advertisement',operation:'create',data:{title:'Unauthorized'}})).status).toBe(403);
 });
 it('denies cross-company reads, writes and deletes by ID',async()=>{
  const client=sdk();
  for(const operation of ['get','update','delete']) expect((await call(client,{entity:'Vehicle',operation,id:'bus-b',data:{name:'Taken'}})).status).toBe(404);
  expect(client.writes()).toBe(0);
 });
 it('overrides hostile filter branches with mandatory tenant scope',async()=>{
  const response=await call(sdk(),{entity:'Vehicle',operation:'filter',query:{$or:[{company_id:'b'},{id:'bus-b'}]}});
  expect(response.data.result).toEqual([]);
 });
 it('allows own-company writes and refuses changing company assignment',async()=>{
  const client=sdk();
  expect((await call(client,{entity:'Vehicle',operation:'update',id:'bus-a',data:{name:'Updated'}})).status).toBe(200);
  expect((await call(client,{entity:'Vehicle',operation:'update',id:'bus-a',data:{company_id:'b'}})).status).toBe(403);
 });
 it('rejects cross-company related records and mismatched vehicle assignment',async()=>{
  const client=sdk();
  expect((await call(client,{entity:'Vehicle',operation:'update',id:'bus-a',data:{route_id:'route-b'}})).status).toBe(403);
  expect((await call(client,{entity:'Fault',operation:'create',data:{vehicle_id:'bus-b',company_id:'a',title:'Wrong'}})).status).toBe(400);
  expect(client.writes()).toBe(0);
 });
 it('validates all bulk records before writing',async()=>{
  const client=sdk();
  const result=await call(client,{entity:'Fault',operation:'bulkCreate',data:[{vehicle_id:'bus-a',company_id:'a',title:'Allowed'},{vehicle_id:'bus-b',company_id:'b',title:'Denied'}]});
  expect(result.status).toBe(403);expect(client.writes()).toBe(0);
 });
 it('gives mechanics maintenance access across every company without credentials',async()=>{
  const client=sdk('mechanic');
  for(const entity of ['Vehicle','Fault','Part','Company']) {
   const result=await call(client,{entity,operation:'list'});
   expect(result.status).toBe(200);expect(result.data.result).toHaveLength(2);
   expect(JSON.stringify(result.data)).not.toContain('SENTINEL');
  }
  expect((await call(client,{entity:'Vehicle',operation:'update',id:'bus-b',data:{current_odometer:123}})).status).toBe(200);
  expect((await call(client,{entity:'Fault',operation:'update',id:'fault-b',data:{status:'resolved'}})).status).toBe(200);
 });
 it('prevents mechanics from changing ownership, roles and credentials',async()=>{
  const client=sdk('mechanic');
  for(const body of [
   {entity:'Company',operation:'update',id:'b',data:{name:'Takeover'}},
   {entity:'User',operation:'update',id:'caller',data:{role:'admin'}},
   {entity:'Vehicle',operation:'update',id:'bus-a',data:{driver_pin:'1234'}},
   {entity:'Vehicle',operation:'update',id:'bus-a',data:{driver_email:'other@test.local'}},
   {entity:'NfcCard',operation:'list'},
   {entity:'KioskDevice',operation:'list'},
  ]) {
   const result=await call(client,body);
   expect(result.status===403 || (result.status===200 && result.data.result.length===0)).toBe(true);
  }
 });
 it('does not expose protected credential or membership entities',async()=>{
  for(const role of ['company','mechanic','staff']) for(const entity of ['DeviceCredential','DriverPinCredential','CompanyMembership','PassengerAccessCredential']) expect((await call(sdk(role),{entity,operation:'list'})).status).toBe(403);
 });
 it('keeps advertisements public and denies anonymous and passenger writes',async()=>{
  expect((await call(sdk(null),{entity:'Advertisement',operation:'list'})).data.result[0].title).toBe('Public ad');
  for(const role of [null,'staff','mechanic']) for(const operation of ['create','update','delete']) {
   const result=await call(sdk(role),{entity:'Advertisement',operation,id:'ad',data:{title:'Changed'}});
   expect([401,403]).toContain(result.status);
  }
  for(const role of ['admin','company']) expect((await call(sdk(role),{entity:'Advertisement',operation:'update',id:'ad',data:{title:'Changed'}})).status).toBe(200);
 });
 it('requires authentication for other public entity reads',async()=>{
  for(const entity of ['Vehicle','Company','Contact','StaffCheckIn','Fault']) expect((await call(sdk(null),{entity,operation:'list'})).status).toBe(401);
 });
 it('allows safe own profile edits but refuses membership and badge self-edits',async()=>{
  const client=sdk('staff');
  expect((await call(client,{entity:'User',operation:'update',id:'caller',data:{phone:'555'}})).status).toBe(200);
  for(const data of [{company_id:'b'},{role:'company'},{nfc_tag_id:'OTHER'},{access_code:'12345'}]) expect((await call(client,{entity:'User',operation:'update',id:'caller',data})).status).toBe(403);
 });
 it('requires an explicit admin assignment to approve company membership',async()=>{
  const client=sdk('admin');
  expect((await call(client,{entity:'User',operation:'update',id:'other',data:{role:'company',company_id:'b'}})).status).toBe(200);
  expect(client.tables.CompanyMembership.find(r=>r.user_id==='other')).toMatchObject({company_id:'b',scope:'manager',active:true});
 });
 it('hides passenger phone numbers and signatures from fleet display',async()=>{
  const client=sdk('staff');client.tables.Trip=[{id:'trip',company_id:'a',passenger_phone:'SENTINEL',pickup_signature_url:'SENTINEL',status:'scheduled'}];
  const response=await call(client,{entity:'Trip',operation:'list'});
  expect(response.data.result[0].status).toBe('scheduled');
  expect(JSON.stringify(response.data)).not.toContain('SENTINEL');
 });
 it('prevents staff from reading manager messages and editing someone else’s message',async()=>{
  const client=sdk('staff');client.tables.GroupMessage.push({id:'manager',company_id:'a',channel:'company',text:'Private'});
  expect((await call(client,{entity:'GroupMessage',operation:'list'})).data.result.map(r=>r.id)).toEqual(['message-a']);
  expect((await call(client,{entity:'GroupMessage',operation:'update',id:'message-a',data:{text:'Changed'}})).status).toBe(403);
 });
 it('rejects credential query oracles and unrestricted entity methods',async()=>{
  expect((await call(sdk('mechanic'),{entity:'Vehicle',operation:'filter',query:{driver_pin:'1234'}})).status).toBe(400);
  expect((await call(sdk(),{entity:'Vehicle',operation:'updateMany',data:{}})).status).toBe(400);
 });
 it('allows admin company creation without letting company users create ownership records',async()=>{
  expect((await call(sdk('admin'),{entity:'Company',operation:'create',data:{name:'New'}})).status).toBe(200);
  expect((await call(sdk(),{entity:'Company',operation:'create',data:{name:'New'}})).status).toBe(403);
 });
 it('expires passenger code memberships and invalidates them when the code changes',async()=>{
  const client=sdk('staff');
  client.tables.CompanyMembership[0].expires_at='2099-01-01';
  client.tables.CompanyMembership[0].code_hash=createHash('sha256').update('SENTINEL').digest('hex');
  expect((await call(client,{entity:'Vehicle',operation:'list'})).data.result).toHaveLength(1);
  client.tables.Company[0].access_code='CHANGED';
  expect((await call(client,{entity:'Vehicle',operation:'list'})).data.result).toEqual([]);
  client.tables.Company[0].access_code='SENTINEL';
  client.tables.CompanyMembership[0].expires_at='2000-01-01';
  expect((await call(client,{entity:'Vehicle',operation:'list'})).data.result).toEqual([]);
 });
 it('keeps centralized unscoped parts editable by mechanics',async()=>{
  const client=sdk('mechanic');
  expect((await call(client,{entity:'Part',operation:'create',data:{part_name:'Shared stock',quantity_in_stock:3}})).status).toBe(200);
 });
 it('scopes company delay broadcasts even when the UI omits company_id',async()=>{
  const client=sdk();
  expect((await call(client,{entity:'Broadcast',operation:'create',data:{title:'Delay',message:'Late'}})).status).toBe(200);
  expect(client.tables.Broadcast[0].company_id).toBe('a');
 });
 it('assigns lost reports to the authenticated passenger and hides others',async()=>{
  const client=sdk('staff');
  const created=await call(client,{entity:'LostItemReport',operation:'create',data:{company_id:'a',description:'Bag',reporter_email:'forged@test.local'}});
  expect(created.status).toBe(200);
  expect(client.tables.LostItemReport[0].reporter_email).toBe('caller@test.local');
  client.tables.LostItemReport.push({id:'other-report',company_id:'a',reporter_id:'other',description:'Private'});
  const read=await call(client,{entity:'LostItemReport',operation:'filter',query:{created_by_id:'forged'}});
  expect(read.data.result).toHaveLength(1);
  expect(read.data.result[0].description).toBe('Bag');
 });
 it('locks all direct custom entities except public advertisement reads to admin',()=>{
  const directory=new URL('../../../base44/entities/',import.meta.url);
  for(const file of fs.readdirSync(directory).filter(f=>f.endsWith('.jsonc') && f!=='User.jsonc')) {
   const schema=JSON.parse(fs.readFileSync(new URL(file,directory),'utf8'));
   for(const operation of ['create','update','delete']) expect(schema.rls[operation]).toEqual({user_condition:{role:'admin'}});
   expect(schema.rls.read).toEqual(file==='Advertisement.jsonc'?{}:{user_condition:{role:'admin'}});
  }
 });
 for(const name of ['weeklyReport','inspectionAlerts','maintenanceAlerts','learnTravelTimes']) it(`${name} rejects anonymous scheduling impersonation`,async()=>{
  const response=await handler(name,sdk(null))(request({}));
  expect(response.status).toBe(401);
 });
 it('deduplicates mechanic inspection rows and rejects changed retry payloads',async()=>{
  const client=sdk('mechanic');
  const body={entity:'InspectionResult',operation:'create',data:{vehicle_id:'bus-a',company_id:'a',inspection_item:'Tyre',condition:'GOOD',client_request_id:'result-123'}};
  expect((await call(client,body)).status).toBe(200);
  expect((await call(client,body)).status).toBe(200);
  expect(client.tables.InspectionResult).toHaveLength(1);
  expect((await call(client,{...body,data:{...body.data,condition:'FAILED'}})).status).toBe(409);
  expect((await call(client,{...body,data:{...body.data,request_actor_id:'other'}})).status).toBe(400);
 });

});
