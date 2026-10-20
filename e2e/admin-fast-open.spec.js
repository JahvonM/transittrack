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

// The admin console in each look, section by section (Apple look). Light only
// once a mode is picked in Account -> Appearance; the colour theme recolours
// the main buttons. With TT_SHOT_DIR set it saves a picture of each.
const lum=c=>{const [r,g,b]=c.match(/\d+/g).map(Number);return (r*299+g*587+b*114)/1000;};
for(const {look,theme=null,accent=null} of [{look:'dark'},{look:'light',theme:'light'},{look:'light-ocean',theme:'light',accent:'ocean'},{look:'dark-sunset',accent:'sunset'}])
 test(`admin console tour (${look})`,async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.addInitScript(({theme,accent})=>{if(theme)localStorage.setItem('tt-theme-v2',theme);if(accent)localStorage.setItem('tt-accent',accent);},{theme,accent});
  await admin(page,{bus:bus('idle')});
  await page.goto('/admin');
  await fleetShown(page);
  const shell=await page.locator('.tt-admin-shell').evaluate(el=>getComputedStyle(el).backgroundColor);
  expect(lum(shell)>180).toBe(theme==='light');
  const add=await page.getByRole('button',{name:'Add vehicle'}).evaluate(el=>getComputedStyle(el).backgroundColor);
  if(accent)expect(add).not.toMatch(/rgb\(0, (2[0-5]\d|1\d\d), (2[0-5]\d)\)/);
  const dir=process.env.TT_SHOT_DIR;
  const shot=async name=>{expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);if(dir){await page.waitForTimeout(400);await page.screenshot({path:`${dir}/admin-${look}-${name}.png`});}};
  await shot('overview');
  for(const [path,name] of [['vehicles','vehicles'],['fleet','fleet'],['trips','jobs'],['users','users'],['companies','companies'],['kiosks','kiosks']]){
   await page.goto('/admin/'+path);
   await page.waitForLoadState('networkidle').catch(()=>{});
   await shot(name);
  }
  await page.goto('/admin');
  await page.getByRole('button',{name:'Add vehicle'}).click();
  await expect(page.getByRole('dialog').first()).toBeVisible();
  await shot('add-vehicle');
 });

test('on a computer set to light, the admin console stays dark until a mode is picked',async({page})=>{
 await page.emulateMedia({colorScheme:'light'});
 await admin(page,{bus:bus('idle')});
 await page.goto('/admin');
 await fleetShown(page);
 expect(lum(await page.locator('.tt-admin-shell').evaluate(el=>getComputedStyle(el).backgroundColor))).toBeLessThan(60);
});
