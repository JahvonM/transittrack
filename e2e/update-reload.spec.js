import {test,expect} from '@playwright/test';

// A screen's file from the old version is gone after a publish: the app
// reloads itself once into the new version instead of showing an error.
async function admin(page,{failTimes}){
 const state={blocked:0,loads:0,reports:[]};
 page.on('domcontentloaded',()=>{ state.loads++; });
 await page.addInitScript(()=>{ localStorage.setItem('base44_access_token','mock-authenticated-session'); localStorage.setItem('tt-map-engine','basic'); });
 await page.route('https://api.mapbox.com/**',r=>r.fulfill({status:404,body:''}));
 await page.route(/\/assets\/Admin-[^/]+\.js$/,route=>{
  if(state.blocked<failTimes){ state.blocked++; return route.fulfill({status:404,body:'gone'}); }
  return route.continue();
 });
 await page.route('**/api/**',async route=>{
  const url=route.request().url();
  if(url.includes('/functions/reportClientError')){ state.reports.push(route.request().postDataJSON()); return route.fulfill({json:{ok:true}}); }
  if(url.includes('/functions/entityAccess')){
   const body=route.request().postDataJSON();
   if(body.entity==='User'&&body.operation==='get') return route.fulfill({json:{result:{id:'admin',email:'admin@test.local',full_name:'Ada Admin',role:'admin'}}});
   return route.fulfill({json:{result:[]}});
  }
  if(url.includes('/entities/User/me')) return route.fulfill({json:{id:'admin',role:'admin',email:'admin@test.local',full_name:'Ada Admin'}});
  return route.fulfill({json:{id:'test-app',public_settings:{authentication_required:false}}});
 });
 return state;
}

test('a missing screen file after a publish reloads once and the screen opens',async({page})=>{
 const state=await admin(page,{failTimes:1});
 await page.goto('/admin/app-errors');
 await expect(page.getByRole('heading',{name:'App errors',level:1})).toBeVisible({timeout:20000});
 expect(state.blocked).toBe(1);
 expect(state.loads).toBe(2);
 expect(state.reports).toEqual([]);
});

test('if the reload does not help, it stops and the error is reported once',async({page})=>{
 const state=await admin(page,{failTimes:99});
 await page.goto('/admin/app-errors');
 await expect.poll(()=>state.reports.length,{timeout:20000}).toBeGreaterThan(0);
 await page.waitForTimeout(1500);
 expect(state.loads).toBe(2);
 expect(state.reports[0].message).toMatch(/dynamically imported module|Importing a module script failed/);
});
