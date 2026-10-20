import {withAdminBatch} from "./helpers/adminBatchMock.js";
import {test,expect} from '@playwright/test';

// The admin console opens with the overview this admin last saw on this
// device (savedScreen.js) while every list is fetched fresh, and never
// raises the SOS alarm from that saved copy.
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const signedIn=`${b64({alg:'none'})}.${b64({sub:'admin-1',exp:Math.floor(Date.now()/1000)+3600})}.sig`;
const bus=(status)=>({id:'bus-a',name:'Bus A',company_id:'a',company_name:'Company A',type:'staff_bus',status,capacity:25});

async function admin(page,fleet){
 await page.addInitScript(t=>{localStorage.setItem('base44_access_token',t);localStorage.setItem('tt-map-engine','basic');},signedIn);
 await page.route('https://api.mapbox.com/**',r=>r.fulfill({status:404,body:''}));
 await page.route('**/api/**',withAdminBatch(async route=>{
  const url=route.request().url();
  if(url.includes('/entities/'))return route.fulfill({status:403,json:{error:'Direct entity access blocked'}});
  if(url.includes('/functions/entityAccess')){
   const b=route.request().postDataJSON();
   if(b.entity==='User'&&b.operation==='get')return route.fulfill({json:{result:{id:'admin-1',role:'admin',full_name:'Test Admin',email:'admin@test.invalid'}}});
   if(b.entity==='Vehicle')return route.fulfill({json:{result:[fleet.bus]}});
   if(b.entity==='Company')return route.fulfill({json:{result:[{id:'a',name:'Company A',access_code:'JOIN-4471'}]}});
   return route.fulfill({json:{result:[]}});
  }
  return route.fulfill({json:{id:'test-app',public_settings:{authentication_required:false}}});
 }));
}
// The overview's vehicle count: 1 once Bus A is on screen.
const fleetShown=(page,opts)=>expect(page.getByRole('region',{name:'Fleet overview'})).toContainText(/1\s*Vehicles/,opts);
const slowServer=page=>page.route('**/api/**',async r=>{await new Promise(f=>setTimeout(f,4000));return r.fallback();});

test('the admin console shows the last overview before the server answers',async({page})=>{
 const fleet={bus:bus('idle')};
 await admin(page,fleet);
 await page.goto('/admin');
 await fleetShown(page);
 await expect.poll(()=>page.evaluate(()=>!!localStorage.getItem('tt_screen_v1:admin'))).toBe(true);
 // The company join code never lands on the device.
 expect(await page.evaluate(()=>localStorage.getItem('tt_screen_v1:admin'))).not.toContain('JOIN-4471');
 await slowServer(page);
 const started=Date.now();
 await page.reload({waitUntil:'commit'});
 await fleetShown(page,{timeout:3000});
 expect(Date.now()-started).toBeLessThan(3000);
});

test('an old SOS in the saved overview never raises the alarm',async({page})=>{
 const fleet={bus:bus('emergency')};
 await admin(page,fleet);
 await page.goto('/admin');
 await expect(page.getByRole('heading',{name:'EMERGENCY SOS'})).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('tt_screen_v1:admin')||'')).toContain('emergency');
 // The SOS has been dealt with; the server is slow to say so.
 fleet.bus=bus('idle');
 await slowServer(page);
 await page.reload({waitUntil:'commit'});
 await fleetShown(page,{timeout:3000});
 await expect(page.getByRole('heading',{name:'EMERGENCY SOS'})).toHaveCount(0);
 await page.waitForTimeout(5000);
 await expect(page.getByRole('heading',{name:'EMERGENCY SOS'})).toHaveCount(0);
});

test('a live SOS still raises the alarm when the console opened from the saved overview',async({page})=>{
 const fleet={bus:bus('idle')};
 await admin(page,fleet);
 await page.goto('/admin');
 await fleetShown(page);
 fleet.bus=bus('emergency');
 await page.reload();
 await expect(page.getByRole('heading',{name:'EMERGENCY SOS'})).toBeVisible();
});

test('signing out wipes the saved overview',async({page})=>{
 await admin(page,{bus:bus('idle')});
 await page.goto('/admin');
 await fleetShown(page);
 await expect.poll(()=>page.evaluate(()=>!!localStorage.getItem('tt_screen_v1:admin'))).toBe(true);
 await page.getByRole('button',{name:'Account menu'}).click();
 await page.getByRole('menuitem',{name:'Sign out'}).click();
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('tt_screen_v1:admin'))).toBeNull();
});
