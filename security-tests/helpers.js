import {createRequire} from 'node:module';
import fs from 'node:fs';
import ts from 'typescript';
import {webcrypto,createHash} from 'node:crypto';
export const digest=value=>createHash('sha256').update(value).digest('hex');
export function load(name,client,exportsList=[],cryptoApi=webcrypto) {
 const file=new URL('../base44/functions/'+name+'/entry.ts',import.meta.url);
 const source=fs.readFileSync(file,'utf8').replace(/npm:@noble\/hashes@1\.8\.0\//g, '@noble/hashes/').replace(/^import .*;\s*$/gm,'')+(exportsList.length?'\nexport { '+exportsList.join(',')+' };':'');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};
 new Function('exports','createClientFromRequest','crypto','secrets','require',js)(exports,()=>client,cryptoApi,{get:()=>null},createRequire(import.meta.url));
 return exports;
}
export const request=body=>new Request('https://isolated.test',{method:'POST',body:JSON.stringify(body)});
export const tablet={id:'tablet',created_date:'2026-10-02T00:00:00Z',status:'active',paired:true,kiosk_type:'bus_boarding',company_id:'a',company_name:'A',vehicle_id:'bus-a',pairing_code:'PAIR12345678'};
function matches(row,query) {
 return Object.entries(query).every(([key,value])=>{
  if(key==='$or')return value.some(q=>matches(row,q));
  if(key==='$and')return value.every(q=>matches(row,q));
  if(value && typeof value==='object')return value.$in?value.$in.includes(row[key]):value.$ne?row[key]!==value.$ne:false;
  return row[key]===value;
 });
}
export function mock(role='staff') {
 const tables={
  User:[{id:'caller',role:role||'staff',email:'caller@test.invalid',full_name:'Caller',company_id:'b'}],
  CompanyMembership:[{id:'membership',user_id:'caller',company_id:'a',scope:role==='company'?'manager':'passenger',active:true}],
  Company:[{id:'a',name:'A',access_code:'JOIN12345678'},{id:'b',name:'B',access_code:'JOIN87654321'}],
  Vehicle:[{id:'bus-a',company_id:'a',name:'Bus A',driver_pin:'1234'},{id:'bus-b',company_id:'b',name:'Bus B'}],
  KioskDevice:[structuredClone(tablet)],
  Contact:[{id:'rider',type:'staff',company_id:'a',name:'Caller',email:'caller@test.invalid',vehicle_id:'bus-a',nfc_card_tag:'CARD',access_code:'12345'}],
  Advertisement:[{id:'ad',title:'Public',active:true}],
 };
 const reads=[],writes=[],emails=[];
 let sequence=0;
 const entities=new Proxy({}, {get:(_,name)=>({
  filter:async(query={},sort,limit=1000,offset=0)=>{
   reads.push({name,method:'filter',query});
   let rows=(tables[name]||[]).filter(r=>matches(r,query));
   if(sort) { const desc=sort.startsWith('-'),field=sort.replace(/^-/, '');rows=[...rows].sort((a,b)=>String(a[field]||'').localeCompare(String(b[field]||''))*(desc?-1:1)); }
   return structuredClone(rows.slice(offset,offset+limit));
  },
  list:async()=>{reads.push({name,method:'list'});return structuredClone(tables[name]||[]);},
  get:async id=>{reads.push({name,method:'get'});return structuredClone((tables[name]||[]).find(r=>r.id===id));},
  create:async data=>{const row={id:'new-'+(++sequence),created_date:new Date().toISOString(),...structuredClone(data)};(tables[name]||=[]).push(row);writes.push({name,method:'create'});return structuredClone(row);},
  update:async(id,data)=>{const row=(tables[name]||[]).find(r=>r.id===id);if(!row)throw new Error('missing');Object.assign(row,structuredClone(data));writes.push({name,method:'update'});return structuredClone(row);},
  delete:async id=>{tables[name]=(tables[name]||[]).filter(r=>r.id!==id);writes.push({name,method:'delete'});},
  bulkCreate:async data=>{const rows=data.map(d=>({id:'new-'+(++sequence),created_date:new Date().toISOString(),...structuredClone(d)}));(tables[name]||=[]).push(...rows);writes.push({name,method:'bulkCreate'});return structuredClone(rows);},
 })});
 return {tables,reads,writes,emails,auth:{me:async()=>role?structuredClone(tables.User[0]):null},asServiceRole:{entities,integrations:{Core:{SendEmail:async data=>{emails.push(data);return {};}}}}};
}

export function interleaveReads(client,entity,participants) {
 const original=client.asServiceRole.entities;
 let pending=[];
 client.asServiceRole.entities=new Proxy(original,{get:(target,name)=>{
  const table=target[name];
  if(name!==entity)return table;
  return {...table,filter:async(...args)=>{
   const snapshot=await table.filter(...args);
   return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Interleaving fixture did not receive all participants')),1500);
    pending.push({resolve,snapshot,timer});
    if(pending.length===participants) {
     const group=pending;pending=[];
     for(const item of group){clearTimeout(item.timer);item.resolve(item.snapshot);}
    }
   });
  }};
 }});
}
