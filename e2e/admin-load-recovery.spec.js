import {withAdminBatch} from "./helpers/adminBatchMock.js";
import {test,expect} from '@playwright/test';
const vehicles=[{id:'bus-a',name:'Bus A',company_id:'a',company_name:'Company A',type:'staff_bus',status:'idle',capacity:25},{id:'bus-b',name:'Bus B',company_id:'b',company_name:'Company B',type:'staff_bus',status:'idle',capacity:25}];
async function session(page,role) {
 const calls=[],direct=[];
 await page.addInitScript(()=>{
   localStorage.setItem('base44_access_token','mock-authenticated-session');
   localStorage.setItem('tt-map-engine','basic');
 });
 await page.route('https://api.mapbox.com/**', r=>r.fulfill({status:404,body:''}));
 await page.route('**/api/**',withAdminBatch(async route=>{
  const request=route.request(), url=request.url();
  if(url.includes('/entities/')) {direct.push(url);return route.fulfill({status:403,json:{error:'Direct entity access blocked'}});}
  if(url.includes('/functions/entityAccess')) {
   const body=request.postDataJSON();calls.push(body);
   let result=[];
   if(body.entity==='User' && body.operation==='get') result={id:'caller',email:'caller@test.local',full_name:'Test Caller',role,company_id:role==='company'?'a':''};
   else if(body.entity==='Vehicle') result=role==='mechanic'?vehicles:[vehicles[0]];
   else if(body.entity==='Company') result=role==='mechanic'?[{id:'a',name:'Company A'},{id:'b',name:'Company B'}]:[{id:'a',name:'Company A'}];
   return route.fulfill({json:{result}});
  }
  return route.fulfill({json:{id:'test-app',public_settings:{authentication_required:false}}});
 }));
 return {calls,direct};
}

test('admin recovers from a fully failed load without leaving a spinner or showing empty fleet',async({page})=>{
 await session(page,'admin');
 let failing=true;
 const reads=[];
 await page.route('**/functions/entityAccess',withAdminBatch(r=>{
  const b=r.request().postDataJSON();reads.push(b);
  if(b.entity==='User'&&b.id==='me')return r.fulfill({json:{result:{id:'caller',role:'admin',full_name:'Test Admin',email:'test@invalid'}}});
  if(failing)return r.fulfill({status:503,json:{error:'Isolated outage'}});
  return r.fulfill({json:{result:b.entity==='Vehicle'?[vehicles[0]]:[]}});
 }));
 await page.goto('/admin');
 await expect(page.getByText("Server couldn't load admin data",{exact:true})).toBeVisible({timeout:20000});
 await expect(page.getByRole('region',{name:'Live Fleet'})).toHaveCount(0);
 failing=false;
 await page.getByRole('button',{name:'Try again',exact:true}).click();
 await expect(page.getByRole('region',{name:'Live Fleet'})).toBeVisible({timeout:20000});
 await expect(page.getByText("Server couldn't load admin data",{exact:true})).toHaveCount(0);
 expect(reads.every(b=>['list','filter','get'].includes(b.operation))).toBe(true);
});
test('admin partial failure keeps its loaded fleet and retry only loads the missing dataset',async({page})=>{
 await session(page,'admin');let failParts=true;const reads=[];
 await page.route('**/functions/entityAccess',withAdminBatch(r=>{
  const b=r.request().postDataJSON();reads.push(b);
  if(b.entity==='User'&&b.id==='me')return r.fulfill({json:{result:{id:'caller',role:'admin',full_name:'Test Admin'}}});
  if(b.entity==='Part'&&failParts)return r.fulfill({status:503,json:{error:'Parts temporarily unavailable'}});
  return r.fulfill({json:{result:b.entity==='Vehicle'?[vehicles[0]]:[]}});
 }));
 await page.goto('/admin');
 await expect(page.getByRole('region',{name:'Live Fleet'})).toBeVisible({timeout:20000});
 await expect(page.getByText("Server couldn't load admin data",{exact:true})).toBeVisible();
 reads.length=0;failParts=false;
 await page.getByRole('button',{name:'Try again',exact:true}).click();
 await expect(page.getByText("Server couldn't load admin data",{exact:true})).toHaveCount(0);
 expect(reads.filter(b=>b.entity==='Part')).toHaveLength(1);
 expect(reads.filter(b=>b.entity==='Company'||b.entity==='Route')).toHaveLength(0);
});

test('passenger directory opens while fleet loading is unavailable',async({page})=>{
 await session(page,'admin');let directoryReads=0;
 await page.route('**/functions/entityAccess',withAdminBatch(route=>{
  const body=route.request().postDataJSON();
  if(body.entity==='User'&&body.id==='me')return route.fulfill({json:{result:{id:'caller',role:'admin',full_name:'Test Admin'}}});
  return route.fulfill({status:503,json:{error:'Fleet unavailable'}});
 }));
 await page.route('**/functions/nfcCards',route=>{directoryReads++;return route.fulfill({json:{people:[{key:'contact:p',id:'p',source:'contact',name:'Directory Passenger',company_id:'a',company_name:'Company A'}],vehicles:[]}});});
 await page.goto('/admin/directory');
 await expect(page.getByText('Directory Passenger',{exact:true})).toBeVisible({timeout:15000});
 expect(directoryReads).toBe(1);
 await expect(page.getByText("Server couldn't load admin data",{exact:true})).toHaveCount(0);
});

test('activity updates use supplied rows without reloading all activity lists',async({page})=>{
 await session(page,'admin');await page.clock.install();let version=1;const reads=[];
 await page.route('**/functions/entityAccess',withAdminBatch(route=>{
  const b=route.request().postDataJSON();reads.push(b);
  if(b.entity==='User'&&b.id==='me')return route.fulfill({json:{result:{id:'caller',role:'admin',full_name:'Test Admin'}}});
  let result=[];
  if(b.entity==='Vehicle')result=[vehicles[0]];
  if(b.entity==='Fault')result=[{id:'fault',title:`Fault version ${version}`,created_date:'2026-10-11T23:00:00Z',company_id:'a'}];
  return route.fulfill({json:{result}});
 }));
 await page.goto('/admin');
 await expect(page.getByText('Fault version 1',{exact:true})).toBeVisible({timeout:15000});
 await page.clock.runFor(25000);
 await expect.poll(()=>reads.filter(b=>b.entity==='Fault'&&b.limit===5000).length).toBeGreaterThan(0);
 version=2;
 await page.clock.runFor(25000);
 await expect(page.getByText('Fault version 2',{exact:true})).toBeVisible({timeout:10000});
 expect(reads.filter(b=>b.entity==='Fault'&&b.limit===20)).toHaveLength(1);
 expect(reads.filter(b=>b.entity==='Incident'&&b.limit===20)).toHaveLength(1);
});

test('admin navigation retains loaded overview data rather than restarting all reads',async({page})=>{
 const {calls}=await session(page,'admin');
 await page.route('**/functions/nfcCards',r=>r.fulfill({json:{people:[],vehicles:[]}}));
 await page.goto('/admin');
 await expect(page.getByRole('region',{name:'Live Fleet'})).toBeVisible({timeout:15000});
 const initial=calls.filter(b=>b.entity==='Vehicle'&&b.limit!==5000).length;
 await page.evaluate(()=>{history.pushState({},'', '/admin/directory');dispatchEvent(new PopStateEvent('popstate'));});
 await expect(page.getByRole('button',{name:'Add passenger',exact:true})).toBeVisible();
 await page.evaluate(()=>{history.pushState({},'', '/admin');dispatchEvent(new PopStateEvent('popstate'));});
 await expect(page.getByRole('region',{name:'Live Fleet'})).toBeVisible();
 expect(calls.filter(b=>b.entity==='Vehicle'&&b.limit!==5000)).toHaveLength(initial);
});
