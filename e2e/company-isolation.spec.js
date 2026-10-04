import {test,expect} from '@playwright/test';
const vehicles=[{id:'bus-a',name:'Bus A',company_id:'a',company_name:'Company A',type:'staff_bus',status:'idle',capacity:25},{id:'bus-b',name:'Bus B',company_id:'b',company_name:'Company B',type:'staff_bus',status:'idle',capacity:25}];
async function session(page,role) {
 const calls=[],direct=[];
 await page.addInitScript(()=>localStorage.setItem('base44_access_token','mock-authenticated-session'));
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
test('mechanic sees vehicles from both companies through scoped backend access',async({page})=>{
 const {calls,direct}=await session(page,'mechanic');
 await page.goto('/mechanic');
 await expect(page.getByRole('tab',{name:/Messages/})).toBeVisible();
 await page.getByRole('tab',{name:/Messages/}).click();
 await expect(page.getByText('Bus A',{exact:true})).toBeVisible();
 await expect(page.getByText('Bus B',{exact:true})).toBeVisible();
 expect(calls.some(c=>c.entity==='Vehicle' && c.operation==='list')).toBe(true);
 expect(direct).toEqual([]);
});
test('company fleet uses approved context and scoped entity access',async({page})=>{
 const {calls,direct}=await session(page,'company');
 await page.goto('/company');
 await expect(page.getByText('Bus A',{exact:true}).first()).toBeVisible();
 await expect(page.getByText('Bus B',{exact:true})).toHaveCount(0);
 expect(calls.some(c=>c.entity==='User' && c.id==='me')).toBe(true);
 expect(direct).toEqual([]);
});
