
import {test,expect} from '@playwright/test';
test('company code replacement uses server issuance rather than gateway credential writes',async({page})=>{
 const calls=[];
 const company={id:'a',name:'Company A',access_code:'LEGACY'};
 await page.addInitScript(()=>localStorage.setItem('base44_access_token','mock-authenticated-session'));
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=req.url();
  if(url.includes('/entities/'))return route.fulfill({status:403,json:{error:'Direct access blocked'}});
  if(url.includes('/functions/manageAccessCodes')){
   const body=req.postDataJSON();calls.push(body);
   Object.assign(company,{access_code:'ABCD2345EFGH',access_code_expires_at:'2026-11-01T12:00:00Z'});
   return route.fulfill({json:{code:company.access_code,expires_at:company.access_code_expires_at}});
  }
  if(url.includes('/functions/entityAccess')){
   const body=req.postDataJSON();calls.push(body);let result=[];
   if(body.entity==='User'&&body.operation==='get')result={id:'caller',role:'company',company_id:'a',email:'test@test.invalid',full_name:'Manager'};
   else if(body.entity==='Company')result=[company];
   return route.fulfill({json:{result}});
  }
  return route.fulfill({json:{id:'test-app',public_settings:{authentication_required:false}}});
 });
 await page.goto('/company');
 await expect(page.getByText('LEGACY',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Get code',exact:true}).click();
 await expect(page.getByText('ABCD2345EFGH',{exact:true})).toBeVisible();
 await expect(page.getByText(/Permanent company code/)).toBeVisible();
 expect(calls).toContainEqual({action:'issue_company',company_id:'a'});
 expect(calls.some(c=>c.data&&'access_code' in c.data)).toBe(false);
});

test('boarding keypad sends all twelve digits and caps additional input',async({page})=>{
 const lookups=[];
 await page.addInitScript(()=>localStorage.setItem('tt_kiosk_device_id','tablet-test'));
 await page.route('**/api/**',async route=>{
  const url=route.request().url(),body=route.request().postDataJSON();
  if(url.includes('/functions/kioskHeartbeat'))return route.fulfill({json:{device_id:'tablet-test',paired:true,kiosk_type:'bus_boarding',company_id:'a',company_name:'A',vehicle_id:'bus-a',vehicle_name:'Bus A',context:{vehicle:{id:'bus-a',name:'Bus A',capacity:25},route:null,ads:[],occupancy:0,today_count:0}}});
  if(url.includes('/functions/kioskCheckIn')){
   if(body?.action==='lookup_code'){lookups.push(body.code);return route.fulfill({status:404,json:{error:'code_not_recognized'}});}
   return route.fulfill({json:{staff:[],generated_at:new Date().toISOString()}});
  }
  if(url.includes('/entities/'))return route.fulfill({status:403,json:{error:'Direct access blocked'}});
  return route.fulfill({json:{id:'test-app',public_settings:{authentication_required:false}}});
 });
 await page.goto('/kiosk');
 await expect(page.getByText('Slide to check in',{exact:true})).toBeVisible();
 const track=await page.getByText('Slide to check in',{exact:true}).locator('..').boundingBox();
 await page.mouse.move(track.x+36,track.y+40);
 await page.mouse.down();
 await page.mouse.move(track.x+track.width-36,track.y+40,{steps:12});
 await page.mouse.up();
 await expect(page.getByRole('button',{name:'Submit code',exact:true})).toBeVisible();
 for(const digit of '1234567890123')await page.getByRole('button',{name:digit,exact:true}).click();
 await page.getByRole('button',{name:'Submit code',exact:true}).click();
 await expect.poll(()=>lookups).toEqual(['123456789012']);
});
