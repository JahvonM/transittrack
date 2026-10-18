import {test,expect} from '@playwright/test';
async function setup(page,{fail=false}={}){
 const calls=[], companies=[{id:'a',name:'Island Transit',phone:'555-0100'},{id:'b',name:'Mountain Transit'}];
 const profile={id:'admin',role:'admin',email:'admin@test.invalid',full_name:'Admin'};
 let shouldFail=fail;
 const workspace=id=>({vehicles:[{id:'bus-'+id,name:id==='a'?'Coastal Bus':'Mountain Bus',route_id:'r1',driver_name:'Test Driver'}],routes:[{id:'r1',name:'Coast Route'},{id:'r2',name:'Town Route'}],drivers:[],devices:[],workplaces:[],contacts:[{id:'p-'+id,name:id==='a'?'Alice Rider':'Bob Rider',type:'staff'}],people:[],limited:false});
 await page.addInitScript(()=>{localStorage.setItem('base44_access_token','mock-session');localStorage.setItem('tt-map-engine','basic');});
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=req.url();let b={};try{b=req.postDataJSON()||{};}catch{}
  if(url.includes('/entities/User/me'))return route.fulfill({json:profile});
  if(url.includes('/functions/entityAccess')){
   let result=[];
   if(b.entity==='User')result=profile;
   if(b.entity==='AdminBootstrap')result={datasets:Object.fromEntries((b.datasets||[]).map(k=>[k,k==='companies'?companies:[]])),errors:{}};
   if(b.entity==='LiveLists')result={lists:Object.fromEntries((b.entities||[]).map(n=>[n,[]])),errors:{}};
   if(b.entity==='Vehicle' && b.operation==='update'){calls.push(b);result={id:b.id,...b.data};}
   return route.fulfill({json:{result}});
  }
  if(url.includes('/functions/companyWorkspace')){
   calls.push({workspace:b});
   if(shouldFail){shouldFail=false;return route.fulfill({status:503,json:{error:'Company temporarily unavailable'}});}
   return route.fulfill({json:workspace(b.company_id)});
  }
  if(url.includes('/functions/routeStops')){
   calls.push({plan:b});return route.fulfill({json:{companies,people:[],buses:[],routes:[]}});
  }
  if(url.includes('/entities/'))return route.fulfill({status:403,json:{error:'Blocked'}});
  return route.fulfill({json:{id:'mock-app',public_settings:{authentication_required:false}}});
 });
 return calls;
}
test('company tabs are scoped, route changes save, back opens another company',async({page})=>{
 const calls=await setup(page);await page.goto('/admin/companies');
 await page.getByRole('button',{name:'Island Transit',exact:true}).click();
 await expect(page.getByRole('tab',{name:'Overview',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(page.getByText('Company contacts', {exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'People',exact:true}).click();
 await expect(page.getByText('Alice Rider',{exact:true})).toBeVisible();
 await expect(page.getByText('Bob Rider',{exact:true})).toHaveCount(0);
 await page.getByRole('tab',{name:'Assigned transport'}).click();
 await page.getByLabel('Route for Coastal Bus').selectOption('r2');
 await expect.poll(()=>calls.find(c=>c.entity==='Vehicle')?.data?.route_id).toBe('r2');
 await page.getByRole('tab',{name:'Pickup planning'}).click();
 await expect.poll(()=>calls.find(c=>c.plan)?.plan.company_id).toBe('a');
 await expect(page.getByRole('combobox',{name:'Company',exact:true})).toHaveCount(0);
 expect(calls.filter(c=>c.workspace)).toHaveLength(1);
 await page.getByRole('button',{name:'All companies'}).click();
 await page.getByRole('button',{name:'Mountain Transit',exact:true}).click();
 await page.getByRole('tab',{name:'People',exact:true}).click();
 await expect(page.getByText('Bob Rider',{exact:true})).toBeVisible();
 await expect(page.getByText('Alice Rider',{exact:true})).toHaveCount(0);
 await page.screenshot({path:'/tmp/tt-company-workspace.png',fullPage:true});
});
test('deep links restore tab and recover failed reads on a narrow screen',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await setup(page,{fail:true});await page.goto('/admin/companies?company=a&companyTab=people');
 await expect(page.getByRole('alert').filter({hasText:'Company temporarily unavailable'})).toBeVisible();
 await page.getByRole('button',{name:'Try again',exact:true}).click();
 await expect(page.getByText('Alice Rider',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.reload();
 await expect(page.getByRole('tab',{name:'People',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(page.getByText('Alice Rider',{exact:true})).toBeVisible();
});
