
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
 await page.getByRole('button',{name:'New code',exact:true}).click();
 await expect(page.getByText('ABCD2345EFGH',{exact:true})).toBeVisible();
 await expect(page.getByText(/New joins allowed until/)).toBeVisible();
 expect(calls).toContainEqual({action:'issue_company',company_id:'a'});
 expect(calls.some(c=>c.data&&'access_code' in c.data)).toBe(false);
});
