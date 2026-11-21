import {test,expect} from '@playwright/test';

// A screen's file from the old version is gone after a publish: the app
// reloads itself once into the new version instead of showing an error.
async function admin(page,{failTimes}){
 const state={blocked:0,loads:0,reports:[]};
 page.on('domcontentloaded',()=>{ state.loads++; });
 await page.addInitScript(()=>{ localStorage.setItem('sb-localhost-auth-token',JSON.stringify({access_token:'mock-authenticated-session',refresh_token:'test-refresh-token',token_type:'bearer',expires_in:3600,expires_at:4102444800,user:{id:'test-user'}})); localStorage.setItem('tt-map-engine','basic'); });
 await page.route('https://api.mapbox.com/**',r=>r.fulfill({status:404,body:''}));
 await page.route(/\/assets\/Admin-[^/]+\.js$/,route=>{
  if(state.blocked<failTimes){ state.blocked++; return route.fulfill({status:404,body:'gone'}); }
  return route.continue();
 });
 await page.route('**/api/**',async route=>{
  const url=route.request().url();
  if(url.includes('/functions/v1/reportClientError')){ state.reports.push(route.request().postDataJSON()); return route.fulfill({json:{ok:true}}); }
  if(url.includes('/functions/v1/entityAccess')){
   const body=route.request().postDataJSON();
   if(body.entity==='User'&&body.operation==='get') return route.fulfill({json:{result:{id:'admin',email:'admin@test.local',full_name:'Ada Admin',role:'admin'}}});
   return route.fulfill({json:{result:[]}});
  }
  if(url.includes('/functions/v1/entityAccess')&&route.request().postDataJSON()?.entity==='User'&&route.request().postDataJSON()?.id==='me') return route.fulfill({json:{result:{id:'admin',role:'admin',email:'admin@test.local',full_name:'Ada Admin'}}});
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

// A browser that won't load a screen's style file (blocked, or a bad
// connection): after the one reload, the screen opens without that styling
// instead of the error screen, and it is noted (not as a crash).
test('a style file that never loads still lets the page open',async({page})=>{
 const state={blocked:0,loads:0,reports:[]};
 page.on('domcontentloaded',()=>{ state.loads++; });
 await page.route(/\/assets\/SiteApp-[^/]+\.css$/,route=>{ state.blocked++; return route.abort(); });
 await page.route('**/api/**',route=>{
  const url=route.request().url();
  if(url.includes('/functions/v1/reportClientError')){ state.reports.push(route.request().postDataJSON()); return route.fulfill({json:{ok:true}}); }
  return route.fulfill({json:{id:'test-app',public_settings:{authentication_required:false}}});
 });
 await page.goto('/site');
 await expect(page.getByRole('link',{name:'Request a ride'}).first()).toBeVisible({timeout:20000});
 await expect(page.getByText('Something went wrong')).toHaveCount(0);
 expect(state.loads).toBe(2);
 await expect.poll(()=>state.reports.length).toBe(1);
 expect(state.reports[0]).toMatchObject({source:'style'});
 expect(state.reports[0].message).toMatch(/^Unable to preload CSS/);
});

// An address the open version doesn't have: usually a page added by a newer
// version than the saved copy the device opened. The app gets the newest
// version and reloads into it once; if the page still isn't there, it says so
// plainly (no leftover builder text).
test('an unknown address reloads once into the newest version, then says the page is not there',async({page})=>{
 const state=await admin(page,{failTimes:0});
 await page.goto('/no-such-page');
 await expect(page.getByRole('heading',{name:'Page not found'})).toBeVisible({timeout:20000});
 expect(state.loads).toBe(2);
 await expect(page.getByText('/no-such-page',{exact:true})).toBeVisible();
 await expect(page.getByText(/Admin Note|implement it in the chat|404/)).toHaveCount(0);
 await page.waitForTimeout(1500);
 expect(state.loads).toBe(2);
 expect(state.reports).toEqual([]);
 await page.getByRole('button',{name:'Go home'}).click();
 await expect(page).not.toHaveURL(/no-such-page/);
});

// Offline, a reload can't fetch anything, so it says why and waits; once the
// device is back online it gets the newest version by itself.
test('offline, an unknown address says so without reloading, then updates once back online',async({page})=>{
 const state=await admin(page,{failTimes:0});
 await page.goto('/admin/app-errors');
 await expect(page.getByRole('heading',{name:'App errors',level:1})).toBeVisible({timeout:20000});
 await page.evaluate(()=>{ Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false}); window.dispatchEvent(new Event('offline')); history.pushState({},'','/no-such-page'); window.dispatchEvent(new PopStateEvent('popstate')); });
 await expect(page.getByRole('heading',{name:'Page not found'})).toBeVisible();
 await expect(page.getByText("If this page is new, it opens once you're back online.")).toBeVisible();
 await page.waitForTimeout(1000);
 expect(state.loads).toBe(1);
 await page.evaluate(()=>{ Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true}); window.dispatchEvent(new Event('online')); });
 await expect.poll(()=>state.loads,{timeout:20000}).toBe(2);
 await expect(page.getByRole('heading',{name:'Page not found'})).toBeVisible({timeout:20000});
 expect(state.reports).toEqual([]);
});
