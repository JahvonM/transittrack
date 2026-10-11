import {test,expect} from '@playwright/test';
const vehicles=[{id:'bus-a',name:'Bus A',company_id:'a',company_name:'Company A',type:'staff_bus',status:'idle',capacity:25},{id:'bus-b',name:'Bus B',company_id:'b',company_name:'Company B',type:'staff_bus',status:'idle',capacity:25}];
async function session(page,role) {
 const calls=[],direct=[];
 await page.addInitScript(()=>{
   localStorage.setItem('base44_access_token','mock-authenticated-session');
   localStorage.setItem('tt-map-engine','basic');
 });
 await page.route('https://api.mapbox.com/**', r=>r.fulfill({status:404,body:''}));
 await page.route('**/api/**',async route=>{
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
 });
 return {calls,direct};
}

test('admin recovers from a fully failed load without leaving a spinner or showing empty fleet',async({page})=>{
 await session(page,'admin');
 let failing=true;
 const reads=[];
 await page.route('**/functions/entityAccess',r=>{
  const b=r.request().postDataJSON();reads.push(b);
  if(b.entity==='User'&&b.id==='me')return r.fulfill({json:{result:{id:'caller',role:'admin',full_name:'Test Admin',email:'test@invalid'}}});
  if(failing)return r.fulfill({status:503,json:{error:'Isolated outage'}});
  return r.fulfill({json:{result:b.entity==='Vehicle'?[vehicles[0]]:[]}});
 });
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
 await page.route('**/functions/entityAccess',r=>{
  const b=r.request().postDataJSON();reads.push(b);
  if(b.entity==='User'&&b.id==='me')return r.fulfill({json:{result:{id:'caller',role:'admin',full_name:'Test Admin'}}});
  if(b.entity==='Part'&&failParts)return r.fulfill({status:503,json:{error:'Parts temporarily unavailable'}});
  return r.fulfill({json:{result:b.entity==='Vehicle'?[vehicles[0]]:[]}});
 });
 await page.goto('/admin');
 await expect(page.getByRole('region',{name:'Live Fleet'})).toBeVisible({timeout:20000});
 await expect(page.getByText("Server couldn't load admin data",{exact:true})).toBeVisible();
 reads.length=0;failParts=false;
 await page.getByRole('button',{name:'Try again',exact:true}).click();
 await expect(page.getByText("Server couldn't load admin data",{exact:true})).toHaveCount(0);
 expect(reads.filter(b=>b.entity==='Part')).toHaveLength(1);
 expect(reads.filter(b=>b.entity==='Company'||b.entity==='Route')).toHaveLength(0);
});
