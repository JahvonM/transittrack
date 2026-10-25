import {withAdminBatch} from "./helpers/adminBatchMock.js";
import {test,expect} from '@playwright/test';

// Admin → Drivers with a driver who signs in to the phone app with a username:
// account changes ask first, a driver left without a company can be given one,
// removing them removes their sign-in first, and buses know them by it.
const KEY='driver.ann_1@login.mcsweenstransport.com';

async function drivers(page,{driver,buses=[]}){
 const calls=[];
 await page.addInitScript(()=>{ localStorage.setItem('base44_access_token','mock-authenticated-session'); });
 await page.route('https://api.mapbox.com/**',r=>r.fulfill({status:404,body:''}));
 await page.route('**/api/**',withAdminBatch(async route=>{
  const url=route.request().url();
  if(url.includes('/functions/driverAccounts')){
   const body=route.request().postDataJSON();calls.push({fn:'driverAccounts',...body});
   return route.fulfill({json:body.action==='reset'?{ok:true,username:'ann_1',temporary_password:'NewTempPass1234'}:{ok:true}});
  }
  if(url.includes('/functions/entityAccess')){
   const body=route.request().postDataJSON();let result=[];
   // Change-history entries the app writes after each change are not part of the flow.
   if(['update','delete','create'].includes(body.operation)&&body.entity!=='AuditLog')calls.push({fn:body.entity+'.'+body.operation,id:body.id,data:body.data});
   if(body.entity==='User'&&body.operation==='get')result={id:'admin',email:'admin@test.local',full_name:'Admin',role:'admin'};
   else if(body.entity==='Driver'&&body.operation==='update'){Object.assign(driver,body.data);result=driver;}
   else if(body.entity==='Driver'&&body.operation==='delete')result={ok:true};
   else if(body.entity==='Driver')result=[driver];
   else if(body.entity==='Company')result=[{id:'a',name:'Coyaba Transport'}];
   else if(body.entity==='Vehicle'&&body.operation==='update')result={id:body.id,...body.data};
   else if(body.entity==='Vehicle')result=buses;
   return route.fulfill({json:{result}});
  }
  return route.fulfill({json:{id:'test-app',public_settings:{authentication_required:false}}});
 }));
 await page.setViewportSize({width:1280,height:900});
 await page.goto('/admin/drivers');
 await expect(page.getByRole('heading',{name:'Ann Driver'})).toBeVisible();
 return calls;
}
const ann=(more={})=>({id:'d1',full_name:'Ann Driver',company_id:'a',company_name:'Coyaba Transport',username:'ann_1',auth_user_id:'auth-ann',phone_app_access:true,...more});

test('resetting a phone password asks first',async({page})=>{
 const calls=await drivers(page,{driver:ann()});
 await page.getByRole('button',{name:'Manage phone account for Ann Driver'}).click();
 await page.getByRole('button',{name:'Reset password'}).click();
 const ask=page.getByRole('alertdialog');
 await expect(ask.getByText("Reset this driver's password?")).toBeVisible();
 await ask.getByRole('button',{name:'Cancel'}).click();
 expect(calls.filter(c=>c.fn==='driverAccounts')).toHaveLength(0);
 await page.getByRole('button',{name:'Reset password'}).click();
 await page.getByRole('alertdialog').getByRole('button',{name:'Reset password'}).click();
 await expect(page.getByText('NewTempPass1234')).toBeVisible();
 expect(calls.filter(c=>c.fn==='driverAccounts')).toEqual([{fn:'driverAccounts',action:'reset',driver_id:'d1'}]);
});

test('a phone-account driver whose company was deleted can be given a new one',async({page})=>{
 const calls=await drivers(page,{driver:ann({company_id:null,company_name:''})});
 await page.getByRole('button',{name:'Edit Ann Driver'}).click();
 const dialog=page.getByRole('dialog');
 const company=dialog.getByRole('combobox');
 await expect(company).toBeEnabled();
 await company.click();
 await page.getByRole('option',{name:'Coyaba Transport'}).click();
 await dialog.getByRole('button',{name:'Save changes'}).click();
 await expect.poll(()=>calls.map(c=>c.fn+(c.action?':'+c.action:''))).toEqual(['Driver.update','driverAccounts:sync']);
 expect(calls[0].data).toMatchObject({company_id:'a',company_name:'Coyaba Transport'});
});

test('removing a driver with a phone account removes their sign-in first',async({page})=>{
 const calls=await drivers(page,{driver:ann(),buses:[{id:'bus-a',name:'Bus 12',plate_number:'HA 1',company_id:'a',company_name:'Coyaba Transport',driver_id:'d1',driver_email:KEY,driver_name:'Ann Driver',status:'idle'}]});
 await page.getByRole('button',{name:'Remove Ann Driver'}).click();
 await expect(page.getByRole('alertdialog')).toContainText('and their phone app sign-in');
 await page.getByRole('alertdialog').getByRole('button',{name:'Remove driver'}).click();
 await expect.poll(()=>calls.map(c=>c.fn+(c.action?':'+c.action:''))).toEqual(['driverAccounts:unlink','Vehicle.update','Driver.delete']);
 expect(calls[1]).toMatchObject({id:'bus-a',data:{driver_id:null,driver_email:null}});
});

test('a bus assigned to a username driver knows them by their sign-in',async({page})=>{
 const calls=await drivers(page,{driver:ann({email:'ann@example.test'}),buses:[{id:'bus-b',name:'Bus 7',plate_number:'HA 7',company_id:'a',company_name:'Coyaba Transport',status:'idle'}]});
 await page.getByRole('combobox',{name:'Assign a bus to Ann Driver'}).click();
 await page.getByRole('option',{name:/Bus 7/}).click();
 await expect.poll(()=>calls.length).toBe(1);
 expect(calls[0]).toMatchObject({fn:'Vehicle.update',id:'bus-b',data:{driver_id:'d1',driver_email:KEY,driver_name:'Ann Driver'}});
});
