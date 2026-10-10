import {createHash} from 'node:crypto';
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
test('mechanic sees vehicles from both companies through scoped backend access',async({page})=>{
 const {calls,direct}=await session(page,'mechanic');
 await page.goto('/mechanic');
 await expect(page.getByRole('tab',{name:/Messages/})).toBeVisible();
 await page.getByRole('tab',{name:/Messages/}).click();
 await expect(page.getByText('Bus A',{exact:true})).toBeVisible();
 await expect(page.getByText('Bus B',{exact:true})).toBeVisible();
 expect(calls.some(c=>c.entity==='Vehicle' && c.operation==='list')).toBe(true);
 // SDK analytics resolves its own signed-in User/me; all app entity reads use the gateway.
 expect(direct.filter(url=>!url.endsWith('/entities/User/me'))).toEqual([]);
});
test('company fleet uses approved context and scoped entity access',async({page})=>{
 const {calls,direct}=await session(page,'company');
 await page.goto('/company');
 await expect(page.getByText(/^Bus A · Driver:/).first()).toBeVisible();
 await expect(page.getByText('Bus B',{exact:true})).toHaveCount(0);
 expect(calls.some(c=>c.entity==='User' && c.id==='me')).toBe(true);
 // SDK analytics resolves its own signed-in User/me; all app entity reads use the gateway.
 expect(direct.filter(url=>!url.endsWith('/entities/User/me'))).toEqual([]);
});

test('email passenger directory links to card issuing without displaying card UIDs',async({page})=>{
 await session(page,'admin');
 await page.route('**/functions/nfcCards',route=>route.fulfill({json:{people:[{key:'user:email-passenger',source:'user',id:'email-passenger',name:'Email Passenger',email:'email@test.invalid',company_id:'a',company_name:'Company A',registered:true,status:'Unassigned'}]}}));
 await page.goto('/admin/directory');
 await expect(page.getByText('Email Passenger',{exact:true})).toBeVisible();
 await expect(page.getByText('Email account',{exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'Issue card'})).toHaveAttribute('href','/admin/cards?person=user%3Aemail-passenger');
});
test('card designer exports a printable PNG using selected passenger details',async({page})=>{
 await session(page,'admin');
 await page.route('**/functions/nfcCards',route=>route.fulfill({json:{people:[{key:'user:email-passenger',name:'Email Passenger',company_name:'Company A',employee_id:'EMP-12',card:{card_uid:'SECRETUID'}}]}}));
 await page.goto('/admin/card-designs');
 await page.getByLabel('Card holder',{exact:true}).click();
 await page.getByRole('option',{name:'Email Passenger · Company A',exact:true}).click();
 await expect(page.getByTestId('card-artwork-preview')).toContainText('Email Passenger');
 await expect(page.getByTestId('card-artwork-preview')).toContainText('EMP-12');
 await expect(page.getByTestId('card-artwork-preview')).not.toContainText('SECRETUID');
 const downloaded=page.waitForEvent('download');
 await page.getByRole('button',{name:'Download PNG',exact:true}).click();
 const download=await downloaded;
 expect(download.suggestedFilename()).toBe('Email-Passenger-front-card.png');
 const stream=await download.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);
 const bytes=Buffer.concat(chunks);
 expect(bytes.subarray(1,4).toString()).toBe('PNG');
 expect(bytes.readUInt32BE(16)).toBe(1011);expect(bytes.readUInt32BE(20)).toBe(638);
 await page.getByRole('button',{name:'Back',exact:true}).click();
 await expect(page.getByTestId('card-artwork-preview')).toContainText('If found');
});

test('passenger previews walking directions then saves a separate roadside pickup',async({page,context})=>{
 await page.setViewportSize({width:390,height:844});
 await session(page,'staff');
 await context.grantPermissions(['geolocation']);
 await context.setGeolocation({latitude:12.005,longitude:-61.701,accuracy:5});
  await page.addInitScript(() => { navigator.geolocation.getCurrentPosition = success => success({coords:{latitude:12.005,longitude:-61.701,accuracy:5}}); });
 await page.addInitScript(()=>localStorage.setItem('tt_company_access_grant','a'.repeat(64)));
 const saved=[];
 const user={id:'caller',role:'staff',email:'caller@test.local',full_name:'Test Passenger',company_id:'a'};
 const routeData={id:'route-a',company_id:'a',name:'Main road route',active:true,stops:[{name:'Start',lat:12,lng:-61.7,order:0},{name:'End',lat:12.01,lng:-61.7,order:1}]};
 await page.route('**/functions/companyAccess',r=>r.fulfill({json:{company:{id:'a',name:'Company A'}}}));
 await page.route('**/functions/entityAccess',r=>{
  const body=r.request().postDataJSON();let result=[];
  if(body.entity==='Bootstrap')result={workplace:null,vehicles:[],routes:[routeData],trips:[]};
  if(body.entity==='User'){ if(body.operation==='update'){saved.push(body.data);Object.assign(user,body.data);}result=user;}
  if(body.entity==='Route')result=[routeData];
  if(body.entity==='Company')result=[{id:'a',name:'Company A'}];
  return r.fulfill({json:{result}});
 });
 await page.route('https://api.mapbox.com/**',r=>{
  const url=r.request().url();
  if(url.includes('/walking/'))return r.fulfill({json:{routes:[{distance:120,duration:90,geometry:{coordinates:[[-61.701,12.005],[-61.7,12.005]]},legs:[{steps:[{mode:'walking',maneuver:{instruction:'Walk east to the main road'}}]}]}],waypoints:[{}, {location:[-61.7,12.005]}]}});
  if(url.includes('/directions/'))return r.fulfill({json:{routes:[{distance:1100,duration:180,geometry:{coordinates:[[-61.7,12],[-61.7,12.01]]}}]}});
  if(url.includes('/geocoding/'))return r.fulfill({json:{features:[{place_name:'Test home, Grenada'}]}});
  return r.fulfill({status:404,body:''});
 });
 await page.goto('/staff');
 await page.getByRole('button',{name:'Find my pickup',exact:true}).click();
 await page.getByRole('button',{name:'Use my location',exact:true}).click();
 await expect(page.getByRole('dialog').getByText('Arrival alerts',{exact:true})).toHaveCount(0);
 await page.screenshot({path:'/tmp/tt-pickup-choose-mobile.png'});
 await page.getByRole('button',{name:'Review this pickup',exact:true}).click();
 await page.getByText('Walking directions',{exact:true}).click();
 await expect(page.getByText('Walk east to the main road',{exact:true})).toBeVisible();
 await page.screenshot({path:'/tmp/tt-pickup-review.png'});
 expect(saved.filter(d=>d.pickup_lat!==undefined)).toHaveLength(0);
 await page.getByRole('button',{name:'Use this pickup',exact:true}).click();
 await expect.poll(()=>saved.filter(d=>d.pickup_lat!==undefined).length).toBe(1);
 const pickup=saved.find(d=>d.pickup_lat!==undefined);
 expect(pickup.pickup_lat).toBeCloseTo(12.005);
 expect(pickup.pickup_lng).toBeCloseTo(-61.7);
 expect(pickup.home_lng).toBeCloseTo(-61.701);
 expect(pickup.pickup_route_id).toBe('route-a');
});

async function passengerShowcase(page, { stale = false, light = false, parked = false } = {}) {
  await session(page,'staff');
  await page.addInitScript(({light}) => {
    localStorage.setItem('tt_company_access_grant','a'.repeat(64));
    localStorage.setItem('tt_staff_pickup','Grand Anse');
    localStorage.setItem('tt-map-engine','basic');
    localStorage.setItem('tt-theme-v2',light ? 'light' : 'dark');
  }, {light});
  const passenger={id:'caller',role:'staff',email:'caller@test.local',full_name:'Test Passenger',company_id:'a',favorite_stop:'Grand Anse'};
  const stops=[{name:"St. George's",lat:12.05,lng:-61.75,order:0},{name:'True Blue',lat:12.02,lng:-61.76,order:1},{name:'Grand Anse',lat:12.01,lng:-61.77,order:2},{name:'Morne Rouge',lat:12,lng:-61.78,order:3}];
  const bus={...vehicles[0],name:'TT-102',route_id:'route-a',current_lat:12.022,current_lng:-61.758,tracking_active:!parked,status:parked ? 'active' : 'on_trip',speed:parked ? 0 : 25,driver_name:'K. Thomas',last_location_update:new Date(Date.now()-(stale ? 600000 : 20000)).toISOString()};
  await page.route('**/functions/companyAccess',r=>r.fulfill({json:{company:{id:'a',name:'Grenada Transport Co.'}}}));
  const buses=[bus,{...bus,id:'bus-c',name:'TT-108'}];
  const routes=[{id:'route-a',company_id:'a',name:'Coastal route',active:true,stops}];
  const state={workplace:null};
  await page.route('**/functions/entityAccess',r=>{
    const b=r.request().postDataJSON();let result=[];
    // The passenger home asks for its company's workplace, buses, routes and trips in one request.
    if(b.entity==='Bootstrap') result={workplace:state.workplace,vehicles:buses,routes,trips:[]};
    if(b.entity==='User') result=passenger;
    if(b.entity==='Vehicle') result=buses;
    if(b.entity==='Route') result=routes;
    return r.fulfill({json:{result}});
  });
  await page.route('https://api.mapbox.com/**',r=>r.fulfill({json:{routes:[{duration:180,distance:1500,geometry:{coordinates:stops.map(s=>[s.lng,s.lat])},legs:[{duration:180,distance:1500,steps:[]}]}]}}));
  await page.route('**/api.open-meteo.com/**',r=>r.fulfill({json:{current:{temperature_2m:28,weather_code:0}}}));
  await page.goto('/staff');
  await expect(page.getByLabel('Your bus',{exact:true})).toBeVisible();
  return state;
}

test('approved passenger home shows ETA and opens its map only on request',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});
  await passengerShowcase(page);
  await expect(page.getByLabel('Route stops')).toBeVisible();
  await expect(page.getByRole('button',{name:/Notify me/})).toBeVisible();
  await expect(page.getByLabel('Your bus',{exact:true}).getByText(/^Live/)).toBeVisible();
  await expect(page.locator('#passenger-live-map')).toHaveCount(0);
  await expect(page.locator('.leaflet-container')).toHaveCount(0);
  await page.getByRole('button',{name:'Show map',exact:true}).click();
  const hero=await page.getByLabel('Your bus',{exact:true}).boundingBox();
  const map=await page.locator('#passenger-live-map').boundingBox();
  expect(map.x).toBeGreaterThan(hero.x+hero.width);
  await page.getByRole('button',{name:'Hide map',exact:true}).click();
  await expect(page.locator('#passenger-live-map')).toHaveCount(0);
  await expect.poll(()=>page.locator('img[src="/images/transit-bus-3d.webp"]').first().evaluate(img=>img.complete && img.naturalWidth>0)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'/tmp/tt-passenger-desktop.png',fullPage:true});
});

test('passenger More has a WhatsApp link for app problems once admin sets the number',async({page})=>{
  await passengerShowcase(page);
  await expect(page.getByRole('link',{name:/Report an app problem/})).toHaveCount(0);
  await page.route('**/functions/appSupport',r=>r.fulfill({json:{whatsapp_number:'14735551234'}}));
  // The passenger More page (its own page since the Oct 8 redesign).
  await page.goto('/more');
  const link=page.getByRole('link',{name:/Report an app problem/});
  await expect(link).toHaveAttribute('href',/^https:\/\/wa\.me\/14735551234\?text=/);
  await expect(link).toHaveAttribute('target','_blank');
});

test('passenger can see other pickup spots nearby or drop their own pin',async({page,context})=>{
 await session(page,'staff');
 await context.grantPermissions(['geolocation']);
 await page.addInitScript(() => { navigator.geolocation.getCurrentPosition = success => success({coords:{latitude:12.005,longitude:-61.701,accuracy:5}}); });
 await page.addInitScript(()=>localStorage.setItem('tt_company_access_grant','a'.repeat(64)));
 const saved=[];
 const user={id:'caller',role:'staff',email:'caller@test.local',full_name:'Test Passenger',company_id:'a'};
 const routeData={id:'route-a',company_id:'a',name:'Main road route',active:true,stops:[{name:'Start',lat:12,lng:-61.7,order:0},{name:'End',lat:12.01,lng:-61.7,order:1}]};
 await page.route('**/functions/companyAccess',r=>r.fulfill({json:{company:{id:'a',name:'Company A'}}}));
 await page.route('**/functions/entityAccess',r=>{
  const body=r.request().postDataJSON();let result=[];
  if(body.entity==='Bootstrap')result={workplace:null,vehicles:[],routes:[routeData],trips:[]};
  if(body.entity==='User'){ if(body.operation==='update'){saved.push(body.data);Object.assign(user,body.data);}result=user;}
  if(body.entity==='Route')result=[routeData];
  if(body.entity==='Company')result=[{id:'a',name:'Company A'}];
  return r.fulfill({json:{result}});
 });
 await page.route('https://api.mapbox.com/**',r=>{
  const url=r.request().url();
  if(url.includes('/walking/')){
   // Walks end exactly where they were asked to go.
   const [,to]=decodeURIComponent(url.split('/walking/')[1].split('?')[0]).split(';');
   const [lng,lat]=to.split(',').map(Number);
   const dist=Math.round(Math.hypot((lat-12.005)*111000,(lng+61.701)*108000));
   return r.fulfill({json:{routes:[{distance:dist,duration:dist/1.3,geometry:{coordinates:[[-61.701,12.005],[lng,lat]]},legs:[{steps:[{mode:'walking',maneuver:{instruction:'Walk to the main road'}}]}]}],waypoints:[{}, {location:[lng,lat]}]}});
  }
  if(url.includes('/directions/'))return r.fulfill({json:{routes:[{distance:1100,duration:180,geometry:{coordinates:[[-61.7,12],[-61.7,12.01]]}}]}});
  if(url.includes('/geocoding/'))return r.fulfill({json:{features:[{place_name:'Test home, Grenada'}]}});
  return r.fulfill({status:404,body:''});
 });
 await page.goto('/staff');
 await page.getByRole('button',{name:'Find my pickup',exact:true}).click();
 await page.getByRole('button',{name:'Use my location',exact:true}).click();
 const spots=page.getByRole('region',{name:'Nearby pickup spots'}).getByRole('button');
 await expect(spots.nth(1)).toBeVisible();
 await page.screenshot({path:'/tmp/tt-pickup-choose.png'});
 await spots.nth(1).click();
 expect(saved.filter(d=>d.pickup_lat!==undefined)).toHaveLength(0);
 await page.getByRole('button',{name:'Review this pickup',exact:true}).click();
 await page.getByRole('button',{name:'Choose another spot',exact:true}).click();
 expect(saved.filter(d=>d.pickup_lat!==undefined)).toHaveLength(0);
 await page.getByRole('button',{name:'Review this pickup',exact:true}).click();
 await page.getByRole('button',{name:'Use this pickup',exact:true}).click();
 await expect.poll(()=>saved.filter(d=>d.pickup_lat!==undefined).length).toBe(1);
 const second=saved.find(d=>d.pickup_lat!==undefined);
 expect(Math.abs(second.pickup_lat-12.005)).toBeGreaterThan(0.0009);
 expect(second.pickup_lng).toBeCloseTo(-61.7);
 // Their own pin: off the road gets a warning, on the road saves with the route.
 // Saving keeps the pickup sheet open on the saved spot; close it first.
 // The sheet can still be settling after the save, so press until it closes.
 await expect(async()=>{ await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0,{timeout:1000}); }).toPass({timeout:10000});
 await page.getByRole('region',{name:'Your pickup'}).getByRole('button',{name:'Change'}).click();
 await page.getByRole('button',{name:'Choose a different spot on the map'}).click();
 const box=page.getByRole('region',{name:'Pick your own pickup spot'});
 await expect(box.getByLabel('Latitude')).toHaveCount(0);
 await expect(box.getByLabel('Longitude')).toHaveCount(0);
 await box.getByRole('button',{name:'Use my location',exact:true}).click();
 await expect(box.getByText(/m from the bus road/)).toBeVisible();
 await page.getByRole('button',{name:'Review this pickup',exact:true}).click();
 await expect(page.getByText(/Walking directions aren't available/)).toBeVisible();
 await page.getByLabel('Name this spot (optional)').fill('Outside the blue shop');
 await page.getByRole('button',{name:'Use this pickup',exact:true}).click();
 await expect.poll(()=>saved.filter(d=>d.pickup_name==='Outside the blue shop').length).toBe(1);
 const mine=saved.find(d=>d.pickup_name==='Outside the blue shop');
 expect(mine).toMatchObject({pickup_lat:12.005,pickup_lng:-61.701,pickup_route_id:'route-a'});
});

test('passenger Home puts the roadside pickup up front and shows the workplace drop-off',async({page})=>{
  const showcase=await passengerShowcase(page);
  const cta=page.getByRole('region',{name:'Get picked up near home'});
  await expect(cta).toBeVisible();
  await cta.getByRole('button',{name:'Find my pickup',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Pickup'})).toBeVisible();
   await expect(page.getByText('Find your pickup',{exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  showcase.workplace={id:'w',company_id:'a',name:'Head office, True Blue',lat:12.0,lng:-61.78};
  await page.route('**/functions/entityAccess',async r=>{
    const b=r.request().postDataJSON();
    if(b.entity==='Workplace')return r.fulfill({json:{result:[{id:'w',company_id:'a',name:'Head office, True Blue',lat:12.0,lng:-61.78}]}});
    if(b.entity==='User')return r.fulfill({json:{result:{id:'caller',role:'staff',email:'caller@test.local',full_name:'Test Passenger',company_id:'a',favorite_stop:'Grand Anse',pickup_lat:12.02,pickup_lng:-61.76,pickup_name:'Roadside by the church',pickup_route_id:'route-a'}}});
    return r.fallback();
  });
  await page.goto('/staff');
  const card=page.getByRole('region',{name:'Your pickup'});
  await expect(card).toContainText('Roadside by the church');
  await expect(card).toContainText('Head office, True Blue');
});

test('turning on notifications says what went wrong instead of claiming success',async({page})=>{
  await page.addInitScript(()=>{
    // A browser where the prompt is closed, then one where it is blocked.
    let answer='default';
    window.__setAnswer=a=>{answer=a;};
    Object.defineProperty(Notification,'permission',{get:()=>window.__perm||'default',configurable:true});
    Notification.requestPermission=async()=>{window.__perm=answer;return answer;};
  });
  await session(page,'admin');
  await page.goto('/admin');
  const bell=page.getByRole('button',{name:'Turn on SOS notifications on this device'});
  await bell.click();
  await expect(page.getByText('Notifications are still off',{exact:true})).toBeVisible();
  await page.evaluate(()=>{window.__perm='default';window.__setAnswer('denied');});
  await bell.click();
  await expect(page.getByText('Notifications are blocked',{exact:true})).toBeVisible();
  await expect(page.getByText('Notifications on',{exact:true})).toHaveCount(0);
});

test('admin saves the app support WhatsApp number in Settings',async({page})=>{
  await session(page,'admin');
  const sets=[];
  await page.route('**/functions/appSupport',r=>{
    const b=r.request().postDataJSON();
    if(b.action==='set'){sets.push(b.whatsapp_number);return r.fulfill({json:{ok:true,whatsapp_number:'14735551234'}});}
    return r.fulfill({json:{whatsapp_number:''}});
  });
  await page.goto('/admin/profile');
  const input=page.getByLabel('Support WhatsApp number');
  await input.fill('+1 473 555 1234');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Saved.'})).toBeVisible();
  expect(sets).toEqual(['+1 473 555 1234']);
  await expect(page.getByRole('link',{name:'Test the link'})).toHaveAttribute('href',/wa\.me\/14735551234/);
});

test('approved passenger mobile layout keeps four navigation items and more menu',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await passengerShowcase(page,{light:true});
  await expect(page.locator('html')).toHaveClass(/light/);
  const nav=page.getByRole('navigation',{name:'Passenger sections'});
  for(const name of ['Home','Map','Buses','More'])await expect(nav.getByRole('button',{name,exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'/tmp/tt-passenger-mobile.png',fullPage:true});
  // More is its own page in the passenger app; Messages and Account live there.
  await nav.getByRole('button',{name:'More',exact:true}).click();
  await expect(page.getByRole('link',{name:/^Messages/})).toBeVisible();
  await expect(page.getByRole('link',{name:/^Account/})).toBeVisible();
});

test('passenger showcase keeps delayed GPS distinct from live arrival',async({page})=>{
  await passengerShowcase(page,{stale:true});
  const card=page.getByLabel('Your bus',{exact:true});
  // Ten minutes without a fix reads as a lost signal; two to ten minutes as a delayed location.
  await expect(card.getByText(/^(Location delayed|Signal lost)$/).first()).toBeVisible();
  await expect(card.getByText(/^Live/)).toHaveCount(0);
  await expect(page.getByLabel('Route stops')).toBeVisible();
});

test('admin showcase keeps metrics, fleet list and working section navigation',async({page})=>{
  await session(page,'admin');
  await page.addInitScript(()=>localStorage.setItem('tt-map-engine','basic'));
  await page.route('https://api.mapbox.com/**',r=>r.fulfill({status:404,body:''}));
  await page.goto('/admin');
  await expect(page.getByRole('region',{name:'Live Fleet'})).toBeVisible();
  await expect(page.getByText('Active buses',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'/tmp/tt-admin-desktop.png',fullPage:true});
  await expect(page.getByRole('button',{name:'Card designer',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'People & access',exact:true}).click();
  await page.getByRole('button',{name:'Card designer',exact:true}).click();
  await expect(page.getByRole('button',{name:'Download PNG',exact:true})).toBeVisible();
});


test('driver PIN is saved explicitly and retains input after a server failure',async({page})=>{
 await session(page,'admin');
 let fail=true; const pins=[];
 await page.route('**/functions/entityAccess',route=>{
  const b=route.request().postDataJSON(); let result=[];
  if(b.entity==='User') result={id:'caller',role:'admin',email:'admin@test.invalid'};
  if(b.entity==='Driver') result=[{id:'d',full_name:'Test Driver',email:'driver@test.invalid',company_id:'a'}];
  if(b.entity==='Vehicle') result=[{...vehicles[0],driver_email:'driver@test.invalid'}];
  if(b.entity==='Company') result=[{id:'a',name:'Company A'}];
  return route.fulfill({json:{result}});
 });
 await page.route('**/functions/manageDriverPin',route=>{
  pins.push(route.request().postDataJSON());
  return route.fulfill(fail?{status:500,json:{error:'Please retry PIN save'}}:{json:{ok:true}});
 });
 await page.goto('/admin/drivers');
 const input=page.getByLabel('New PIN for Bus A');
 await input.fill('0123'); await input.blur();
 expect(pins).toHaveLength(0);
 await page.getByRole('button',{name:'Save PIN',exact:true}).click();
 await expect(input).toHaveValue('0123');
 await expect(page.locator('p[role=status]').filter({hasText:'Please retry PIN save'})).toBeVisible();
 fail=false;
 await page.getByRole('button',{name:'Save PIN',exact:true}).click();
 await expect(input).toHaveValue('');
 await expect(page.getByRole('status').filter({hasText:'PIN saved'})).toBeVisible();
 expect(pins[1]).toEqual({vehicle_id:'bus-a',pin:'0123'});
});

test('existing card status and bulk role dropdown are clear',async({page})=>{
 await session(page,'admin');
 const people=[{key:'user:p',source:'user',id:'p',name:'Existing Passenger',type:'staff',status:'Card Issued',company_id:'a',registered:true},
 {key:'driver:d',source:'driver',id:'d',name:'New Driver',type:'driver',status:'Unassigned',company_id:'a'}];
 await page.route('**/functions/nfcCards',r=>r.fulfill({json:{people,cards:[],vehicles,tablets:[]}}));
 await page.goto('/admin/directory');
 await expect(page.getByText('Card issued',{exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'Manage card'})).toBeVisible();
 await page.goto('/admin/cards');
 await page.getByRole('tab',{name:'Bulk setup',exact:true}).click();
 await page.getByRole('combobox',{name:'Card holder role'}).click();
 await page.getByRole('option',{name:'Drivers',exact:true}).click();
 await expect(page.getByText('New Driver',{exact:true})).toBeVisible();
 await expect(page.getByText('Existing Passenger',{exact:true})).toHaveCount(0);
});

test('avatar can replace a photo in exported card artwork',async({page})=>{
 await session(page,'admin');
 await page.route('**/functions/nfcCards',r=>r.fulfill({json:{people:[]}}));
 await page.goto('/admin/card-designs');
 await page.getByRole('button',{name:'Ocean avatar',exact:true}).click();
 await expect(page.getByTestId('card-artwork-preview').locator('image')).toHaveAttribute('href',/^data:image\/png;base64,/);
 const downloaded=page.waitForEvent('download');
 await page.getByRole('button',{name:'Download PNG',exact:true}).click(); await downloaded;
 await page.getByRole('button',{name:'Use initials / no photo',exact:true}).click();
 await expect(page.getByTestId('card-artwork-preview').locator('image')).toHaveCount(0);
});

test('admin sees when a tablet\'s card reader helper cannot reach its screen',async({page})=>{
 await session(page,'admin');
 const ago=m=>new Date(Date.now()-m*60000).toISOString();
 await page.route('**/functions/entityAccess',route=>{
  const b=route.request().postDataJSON(); let result=[];
  if(b.entity==='User') result={id:'caller',role:'admin',email:'admin@test.invalid'};
  if(b.entity==='KioskDevice') result=[
   {id:'tab-broken',label:'bus one',kiosk_type:'bus_boarding',paired:true,status:'active',last_seen:ago(1),helper_health:{version:'1.7',reader:'Connected',reported_at:ago(2500)},app_health:{reader:'usb_reader',online:true,reported_at:ago(1)}},
   {id:'tab-ok',label:'bus two',kiosk_type:'bus_boarding',paired:true,status:'active',last_seen:ago(1),helper_health:{version:'1.7',reader:'Connected',reported_at:ago(1)},app_health:{reader:'usb_reader',online:true,reported_at:ago(1)}}];
  return route.fulfill({json:{result}});
 });
 await page.goto('/admin/kiosks');
 const alerts=page.getByText(/Card reader helper can't reach this tablet's screen/);
 await expect(alerts).toHaveCount(1);
 await expect(alerts).toContainText('run Update in the tablet setup tool');
});

test('tablet details and admin menu stay aligned on narrow screens',async({page})=>{
 await session(page,'admin'); await page.setViewportSize({width:390,height:844});
 await page.route('**/functions/entityAccess',route=>{
  const b=route.request().postDataJSON(); let result=[];
  if(b.entity==='User') result={id:'caller',role:'admin',email:'admin@test.invalid'};
  if(b.entity==='KioskDevice') result=[{id:'tablet-test',label:'Bus 2 long tablet name',kiosk_type:'driver',company_name:'Island Transit Company',vehicle_name:'Test vehicle with a long name',paired:true,status:'active',pairing_code:'TESTPAIRCODE12',helper_health:{version:'1.5',battery:79,parked:true,gps:'Not plugged in',reader:'Connected',reported_at:new Date().toISOString()},app_health:{build:'2026-10-04 12:00'}}];
  return route.fulfill({json:{result}});
 });
 await page.goto('/admin/kiosks');
 await expect(page.getByText('Battery 79%',{exact:true})).toBeVisible();
 await expect(page.getByText('GPS: Not plugged in',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 // ui-redesign: the phone admin menu button is "Open menu"; Maintenance Schedule is "Maintenance".
 await page.getByRole('button',{name:'Open menu',exact:true}).click();
 const item=page.getByRole('dialog').getByRole('button',{name:'Maintenance',exact:true}).first();
 await expect(item).toHaveCSS('text-align','left');
});

test('company join QR checks its code after sign-in and keeps it out of the address bar',async({page})=>{
 await session(page,'staff');
 const verifies=[];
 await page.route('**/functions/companyAccess',r=>{
  const b=r.request().postDataJSON();
  if(b.action==='verify'){verifies.push(b);return r.fulfill({json:{company:{id:'a',name:'Company A'},grant:'b'.repeat(64)}});}
  return r.fulfill({status:401,json:{error:'Company code required'}});
 });
 await page.goto('/join#code=abcd2345efgh');
 await expect(page).toHaveURL(/\/staff$/);
 await expect.poll(()=>verifies.length).toBe(1);
 expect(verifies[0].code).toBe('ABCD2345EFGH');
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('tt_company_access_grant'))).toBe('b'.repeat(64));
 expect(await page.evaluate(()=>sessionStorage.getItem('tt_pending_company_code'))).toBeNull();
});

test('company join QR asks a signed-out visitor to sign in first',async({page})=>{
 await page.route('**/api/**',r=>r.request().url().includes('/public-settings/')
  ? r.fulfill({json:{id:'test-app',public_settings:'public_without_login'}}) // answered even when signed out
  : r.fulfill({status:401,json:{error:'Not signed in'}}));
 await page.goto('/join#code=ABCD2345EFGH');
 await expect(page.getByRole('heading',{name:'Join your bus company'})).toBeVisible();
 expect(new URL(page.url()).hash).toBe('');
 await expect(page.getByRole('link',{name:'Create an account'})).toHaveAttribute('href','/register?returnTo=%2Fjoin');
 expect(await page.evaluate(()=>sessionStorage.getItem('tt_pending_company_code'))).toBe('ABCD2345EFGH');
});

test('a damaged company join QR is refused without calling the server',async({page})=>{
 await page.route('**/api/**',r=>r.request().url().includes('/public-settings/')
  ? r.fulfill({json:{id:'test-app',public_settings:'public_without_login'}}) // answered even when signed out
  : r.fulfill({status:401,json:{error:'Not signed in'}}));
 await page.goto('/join#code=<script>');
 await expect(page.getByRole('heading',{name:"This QR code didn't work"})).toBeVisible();
 expect(await page.evaluate(()=>sessionStorage.getItem('tt_pending_company_code'))).toBeNull();
});

test('company dashboard shows a passenger QR for its access code',async({page})=>{
 await session(page,'company');
 await page.route('**/functions/entityAccess',r=>{
  const b=r.request().postDataJSON(); let result=[];
  if(b.entity==='User') result={id:'caller',email:'caller@test.local',full_name:'Test Caller',role:'company',company_id:'a'};
  if(b.entity==='Company') result=b.operation==='get'?{id:'a',name:'Company A',access_code:'ABCD2345EFGH'}:[{id:'a',name:'Company A',access_code:'ABCD2345EFGH'}];
  return r.fulfill({json:{result}});
 });
 await page.goto('/company');
 await page.getByRole('button',{name:'Show QR',exact:true}).click();
 const img=page.getByRole('img',{name:'QR code to join Company A'});
 await expect(img).toBeVisible();
 await expect(img).toHaveAttribute('src',/^data:image\/png;base64,/);
});

test('admin keeps the current menu group open and message bubble stays above AI',async({page})=>{
 await session(page,'admin');
 await page.goto('/admin/drivers');
 const nav=page.getByRole('navigation',{name:'Admin'});
 await expect(nav.getByRole('button',{name:'Drivers',exact:true})).toHaveAttribute('aria-current','page');
 await expect(nav.getByRole('button',{name:'People & access',exact:true})).toHaveAttribute('aria-expanded','true');
 await expect(nav.getByRole('button',{name:'Fleet',exact:true})).toHaveAttribute('aria-expanded','false');
 await nav.getByRole('button',{name:'Card designer',exact:true}).click();
 await expect(nav.getByRole('button',{name:'Card designer',exact:true})).toHaveAttribute('aria-current','page');
 await expect(nav.getByRole('button',{name:'People & access',exact:true})).toHaveAttribute('aria-expanded','true');
 const tools=nav.getByRole('button',{name:'All tools',exact:true});
 await expect(tools).toHaveAttribute('aria-expanded','false');
 await expect(nav.getByRole('button',{name:'Change history',exact:true})).toHaveCount(0);
 await tools.click();
 await expect(nav.getByRole('button',{name:'Change history',exact:true})).toBeVisible();
 await tools.click();
 const messages=page.getByRole('button',{name:'Open messages',exact:true});
 const ai=page.getByRole('button',{name:'Open AI assistant',exact:true});
 await expect(messages).toBeVisible();
 await expect(ai).toBeVisible();
 const m=await messages.boundingBox(),a=await ai.boundingBox();
 expect(m.y+m.height).toBeLessThanOrEqual(a.y);
});

test('message bubble starts a new conversation without prior messages',async({page})=>{
 await session(page,'admin');
 const sent=[];
 await page.route('**/functions/entityAccess', async r=>{
   const b=r.request().postDataJSON();let result=[];
   if(b.entity==='User')result={id:'caller',email:'caller@test.local',role:'admin'};
   if(b.entity==='Vehicle')result=vehicles;
   if(b.entity==='GroupMessage' && b.operation==='create'){sent.push(b.data);result={...b.data,id:'sent-1',created_date:new Date().toISOString()};}
   return r.fulfill({json:{result}});
 });
 await page.goto('/admin');
 await page.getByRole('button',{name:'Open messages',exact:true}).click();
 await page.getByRole('button',{name:'New message',exact:true}).click();
 await page.getByRole('button',{name:/Bus B.*No messages/}).click();
 await page.getByRole('button',{name:/Passengers.*No messages/}).click();
 await page.getByPlaceholder("Message this bus's passengers…").fill('Bus departs in five minutes');
 await page.getByRole('button',{name:'Send message',exact:true}).click();
 await expect(page.getByText('Bus departs in five minutes',{exact:true})).toBeVisible();
 expect(sent).toHaveLength(1);
 expect(sent[0]).toMatchObject({vehicle_id:'bus-b',company_id:'b',channel:'staff'});
});

test('fleet history opens latest recorded day for an offline bus and replaces timeline page',async({page})=>{
 await session(page,'admin');
 await page.addInitScript(()=>localStorage.setItem('tt-map-engine','basic'));
 const recorded='2026-09-30';
 await page.route('**/functions/entityAccess',async r=>{
   const b=r.request().postDataJSON();let result=[];
   if(b.entity==='User')result={id:'caller',role:'admin',email:'caller@test.local'};
   if(b.entity==='Vehicle')result=vehicles;
   if(b.entity==='LocationPing'){
     const pings=[{id:'p1',vehicle_id:'bus-a',lat:12,lng:-61.7,recorded_at:recorded+'T12:00:00Z'},{id:'p2',vehicle_id:'bus-a',lat:12.001,lng:-61.7,recorded_at:recorded+'T12:01:00Z'}];
     result=b.limit===1?[pings[1]]:b.query?.recorded_at?.$gte?.startsWith(recorded)?pings:[];
   }
   return r.fulfill({json:{result}});
 });
 await page.goto('/location-timeline');
 await expect(page.getByRole('heading',{name:'Location timeline',exact:true})).toBeVisible();
 await expect(page.getByLabel('Day',{exact:true})).toHaveValue(recorded);
 await expect(page.getByTestId('replay-map')).toBeVisible();
 await expect(page.getByRole('button',{name:'Location timeline',exact:true})).toHaveCount(0);
 await page.getByRole('combobox',{name:'Bus',exact:true}).click();
 await expect(page.getByRole('option',{name:'Bus B',exact:true})).toBeVisible();
});

test('fleet map centers on a late GPS fix and accepts newer less accurate positions',async({page})=>{
 await session(page,'admin');
 await page.addInitScript(()=>{
   localStorage.setItem('tt-map-engine','basic');
   navigator.geolocation.getCurrentPosition=()=>{};
   window.gpsCallbacks=new Map();
   let id=0;
   navigator.geolocation.watchPosition=success=>{window.gpsCallbacks.set(++id,success);return id;};
   navigator.geolocation.clearWatch=id=>window.gpsCallbacks.delete(id);
 });
 await page.goto('/admin/fleet');
 await expect(page.locator('.leaflet-container')).toBeVisible({timeout:20000});
 await page.evaluate(()=>{
   for(const success of window.gpsCallbacks.values())success({coords:{latitude:12.04,longitude:-61.74,accuracy:5}});
 });
 const marker=page.locator('.leaflet-container path.leaflet-interactive').first();
 await expect(marker).toBeVisible();
 await expect.poll(async()=>{
   const map=await page.locator('.leaflet-container').boundingBox(), dot=await marker.boundingBox();
   return Math.max(Math.abs(dot.x+dot.width/2-(map.x+map.width/2)),Math.abs(dot.y+dot.height/2-(map.y+map.height/2)));
 }).toBeLessThan(3);

 await page.evaluate(()=>{
   for(const success of window.gpsCallbacks.values())success({coords:{latitude:12.041,longitude:-61.74,accuracy:1200}});
 });
 await expect.poll(async()=>{
   const map=await page.locator('.leaflet-container').boundingBox(),dot=await marker.boundingBox();
   return Math.abs(dot.y+dot.height/2-(map.y+map.height/2));
 }).toBeLessThan(3);
 await expect(page.getByText('Approximate location · accuracy about 1200 metres')).toBeVisible();
 await page.getByRole('button',{name:'My location',exact:true}).click();
 await expect(page.locator('.leaflet-container')).toBeVisible();
});

test('tablet setup download is one file with the verified helper built in',async({page})=>{
 await session(page,'admin');
 const apk=Buffer.from([80,75,3,4,1,7]);
 await page.route('**/functions/helperRelease',r=>r.fulfill({json:{version:'1.7',version_code:8,file_name:'TransitTrack-Kiosk-Helper.apk',sha256:createHash('sha256').update(apk).digest('hex'),apk_base64:apk.toString('base64')}}));
 await page.route('**/functions/entityAccess',r=>{
   const b=r.request().postDataJSON();let result=[];
   if(b.entity==='User')result={id:'caller',role:'admin',email:'admin@test.invalid'};
   if(b.entity==='KioskDevice')result=[{id:'tablet-test',label:'Bus 2',kiosk_type:'bus_boarding',paired:true,status:'active',vehicle_name:'Bus 2',pairing_code:'TESTPAIR12'}];
   return r.fulfill({json:{result}});
 });
 await page.goto('/admin/kiosks');
 const getBat=async(button,name)=>{
   const pending=page.waitForEvent('download');
   await button.click();
   const download=await pending;
   expect(download.suggestedFilename()).toBe(name);
   const stream=await download.createReadStream();const chunks=[];
   for await(const part of stream)chunks.push(part);
   return Buffer.concat(chunks).toString('latin1');
 };
 const builtIn=t=>Buffer.from(t.split('\r\n').filter(l=>l.startsWith('::TTAPK ')).map(l=>l.slice(8)).join(''),'base64');
 const perTablet=await getBat(page.getByRole('button',{name:'Setup file',exact:true}),'TransitTrack-Setup-Bus-2-Helper-1.7.bat');
 expect(perTablet).toContain('set PRESET_TYPE=2\r\n');
 expect(perTablet).toContain(`set HELPER_SHA256=${createHash('sha256').update(apk).digest('hex')}\r\n`);
 expect(builtIn(perTablet)).toEqual(apk);
 const generic=await getBat(page.getByRole('button',{name:'Setup tool',exact:true}),'TransitTrack-Tablet-Setup-Helper-1.7.bat');
 expect(generic).toContain('set PRESET_TYPE=\r\n');
 expect(builtIn(generic)).toEqual(apk);
 // No separate APK download any more.
 await expect(page.getByRole('button',{name:'Helper app',exact:true})).toHaveCount(0);
});

test('company logo upload previews the banner and saves its URL',async({page})=>{
 await session(page,'admin');
 let saved;
 await page.route('**/api/**',async r=>{
  if(/Upload(?:Public)?File/i.test(r.request().url()))return r.fulfill({json:{file_url:'https://test.invalid/company-logo.png'}});
  return r.fallback();
 });
 await page.route('**/functions/entityAccess',async r=>{
  const b=r.request().postDataJSON();
  if(b.entity==='Company'&&b.operation==='create'){saved=b.data;return r.fulfill({json:{result:{id:'new-company',...b.data}}});}
  return r.fallback();
 });
 await page.route('https://test.invalid/company-logo.png',r=>r.fulfill({path:'/app/public/images/transit-bus-3d.webp',contentType:'image/webp'}));
 await page.goto('/admin/companies');
 await page.getByPlaceholder('Island Transit Co.').fill('Logo Company');
 await page.getByLabel('Company logo',{exact:true}).setInputFiles({name:'logo.png',mimeType:'image/png',buffer:Buffer.from([137,80,78,71])});
 const preview=page.getByLabel('Company banner preview');
 await expect(preview.getByRole('img',{name:'Logo Company logo'})).toHaveAttribute('src','https://test.invalid/company-logo.png');
 await page.getByRole('button',{name:'Create company',exact:true}).click();
 await expect.poll(()=>saved).toMatchObject({name:'Logo Company',logo_url:'https://test.invalid/company-logo.png'});
});

test('fleet explains denied location permission and allows retry',async({page})=>{
 await session(page,'admin');
 await page.addInitScript(()=>{
  navigator.geolocation.getCurrentPosition=(ok,fail)=>fail({code:1});
  navigator.geolocation.watchPosition=(ok,fail)=>{fail({code:1});return 1;};
  navigator.geolocation.clearWatch=()=>{};
 });
 await page.goto('/admin/fleet');
 await expect(page.getByText('Location permission denied. Enable location access to see yourself on the map.')).toBeVisible();
 await page.getByRole('button',{name:'My location',exact:true}).click();
 await expect(page.getByText('Location permission denied. Enable location access to see yourself on the map.')).toBeVisible();
});

test('passenger Buses is distinct from Home and chat bubble works on both',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await passengerShowcase(page);
 const bubble=page.getByRole('button',{name:'Open passenger chat',exact:true});
 await expect(bubble).toBeVisible();
 await bubble.click();
 await expect(page.getByRole('heading',{name:/TT-102 chat/})).toBeVisible();
 await page.keyboard.press('Escape');
 const nav=page.getByRole('navigation',{name:'Passenger sections'});
 await nav.getByRole('button',{name:'Buses',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Company buses',exact:true})).toBeVisible();
 await expect(page.getByLabel('Your bus',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:/Notify me/})).toHaveCount(0);
 await expect(page.getByRole('group',{name:'Filter buses',exact:true})).toBeVisible();
 await expect(page.getByLabel('Company bus directory').getByText('TT-102',{exact:true})).toBeVisible();
 await expect(page.locator('#passenger-live-map')).toHaveCount(0);
 await page.getByRole('button',{name:'Show map',exact:true}).click();
 await expect(page.locator('#passenger-live-map')).toBeVisible();
 await bubble.click();
 await expect(page.getByRole('heading',{name:/TT-102 chat/})).toBeVisible();
 await page.keyboard.press('Escape');
 await nav.getByRole('button',{name:'Home',exact:true}).click();
 await expect(page.getByLabel('Your bus',{exact:true})).toBeVisible();
 await expect(page.locator('#passenger-live-map')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('card issuing sends the card list to every paired boarding tablet at once',async({page})=>{
 await session(page,'admin');
 const sent=[];
 const tablets=[{id:'t1',vehicle_id:'bus-a',paired:true,active:true},{id:'t2',vehicle_id:'bus-a',paired:true,active:true},{id:'t3',vehicle_id:'bus-b',paired:true,active:true},{id:'t4',vehicle_id:'bus-c',paired:false,active:true}];
 await page.route('**/functions/nfcCards',r=>{
  const b=r.request().postDataJSON();
  if(b.action==='send_to_bus'){sent.push(b.vehicle_id);return r.fulfill({json:{ok:true,sent:tablets.filter(t=>t.vehicle_id===b.vehicle_id&&t.paired).length}});}
  return r.fulfill({json:{people:[],cards:[],vehicles:[{id:'bus-a',name:'Bus A'},{id:'bus-b',name:'Bus B'}],tablets}});
 });
 await page.goto('/admin/cards');
 await page.getByRole('button',{name:'Send card list to all tablets',exact:true}).click();
 await expect(page.getByText('Card list sent to 3 tablets').first()).toBeVisible();
 expect(sent.sort()).toEqual(['bus-a','bus-b']);
});

test('admin pages ride out Base44 "too many requests" instead of going blank',async({page})=>{
 await session(page,'admin');
 const limited=new Set();
 await page.route('**/functions/entityAccess',r=>{
   const b=r.request().postDataJSON();
   // The first request for each list is rate limited, as Base44 does under a burst.
   const key=`${b.entity}:${b.operation}`;
   if(b.entity!=='User'&&!limited.has(key)){limited.add(key);return r.fulfill({status:429,json:{error:'Too many requests'}});}
   let result=[];
   if(b.entity==='User')result=b.operation==='get'?{id:'caller',role:'admin',email:'admin@test.invalid'}:[];
   if(b.entity==='KioskDevice')result=[{id:'tablet-test',label:'Bus 2',kiosk_type:'bus_boarding',paired:true,status:'active',vehicle_name:'Bus 2',pairing_code:'TESTPAIR12'}];
   return r.fulfill({json:{result}});
 });
 await page.goto('/admin/kiosks');
 await expect(page.getByRole('button',{name:'Copy pairing code for Bus 2'})).toBeVisible({timeout:15000});
 await expect(page.getByText('No kiosk tablets registered yet.')).toHaveCount(0);
 await expect(page.getByText("Couldn't load devices")).toHaveCount(0);
 expect(limited.has('KioskDevice:list')).toBe(true);
});

test('admin uploads actual bus artwork and saves its URL',async({page})=>{
 await session(page,'admin');
 let saved;
 await page.route('**/api/**',async r=>{
  if(/UploadFile/i.test(r.request().url()))return r.fulfill({json:{file_url:'https://test.invalid/bus-render.webp'}});
  return r.fallback();
 });
 await page.route('https://test.invalid/bus-render.webp',r=>r.fulfill({path:'/app/public/images/transit-bus-3d.webp',contentType:'image/webp'}));
 await page.route('**/functions/entityAccess',async r=>{
  const b=r.request().postDataJSON();
  if(b.entity==='Vehicle'&&b.operation==='update'){saved=b.data;return r.fulfill({json:{result:{...vehicles[0],...b.data}}});}
  return r.fallback();
 });
 await page.goto('/admin/vehicles');
 await page.getByRole('button',{name:'Edit Bus A',exact:true}).click();
 await page.getByLabel('Bus photo or 3D render',{exact:true}).setInputFiles({name:'bus.webp',mimeType:'image/webp',buffer:Buffer.from([82,73,70,70])});
 await expect(page.getByRole('img',{name:'Bus A artwork preview'})).toHaveAttribute('src','https://test.invalid/bus-render.webp');
 await page.getByRole('button',{name:'Save changes',exact:true}).click();
 await expect.poll(()=>saved).toMatchObject({image_url:'https://test.invalid/bus-render.webp'});
});

test('pickup selection is a draft until confirmed, supports search, and keeps the map optional',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await passengerShowcase(page);
 const saved=[];
 await page.route('**/functions/entityAccess',async r=>{
  const b=r.request().postDataJSON();
  if(b.entity==='User'&&b.operation==='update'){saved.push(b.data);return r.fulfill({json:{result:{id:'caller',...b.data}}});}
  return r.fallback();
 });
 await page.getByRole('button',{name:'Find my pickup',exact:true}).click();
 let dialog=page.getByRole('dialog',{name:'Pickup'});
 await dialog.getByRole('button',{name:'Choose a company stop instead'}).click();
 await expect(dialog.getByText('Coastal route',{exact:true}).first()).toBeVisible();
 await expect(dialog.getByLabel('Pickup stops map')).toHaveCount(0);
 await dialog.getByLabel('Search stops or areas').fill('True Blue');
 await dialog.getByRole('button',{name:/^True Blue/}).click();
 expect(saved).toHaveLength(0);
 expect(await page.evaluate(()=>localStorage.getItem('tt_staff_pickup'))).toBe('Grand Anse');
 await page.screenshot({path:'/tmp/tt-pickup-mobile.png'});
 await dialog.getByRole('button',{name:'View stops on map',exact:true}).click();
 await expect(dialog.getByLabel('Pickup stops map').locator('.leaflet-container')).toBeVisible();
 await dialog.getByRole('button',{name:'Hide stops map',exact:true}).click();
 await expect(dialog.getByLabel('Pickup stops map')).toHaveCount(0);
 await page.keyboard.press('Escape');
 expect(saved).toHaveLength(0);
 await page.getByRole('button',{name:'Find my pickup',exact:true}).click();
 dialog=page.getByRole('dialog',{name:'Pickup'});
 await dialog.getByRole('button',{name:'Choose a company stop instead'}).click();
 await dialog.getByRole('button',{name:/^True Blue/}).click();
 await dialog.getByRole('button',{name:'Confirm pickup',exact:true}).click();
 await expect(dialog).toHaveCount(0);
 expect(saved).toEqual([{favorite_stop:'True Blue'}]);
 expect(await page.evaluate(()=>localStorage.getItem('tt_staff_pickup'))).toBe('True Blue');
});
test('failed pickup save retains the old choice and allows retry',async({page})=>{
 await passengerShowcase(page);
 let fail=true;
 await page.route('**/functions/entityAccess',async r=>{
  const b=r.request().postDataJSON();
  if(b.entity==='User'&&b.operation==='update')return r.fulfill(fail?{status:503,json:{error:'Unavailable'}}:{json:{result:{id:'caller',...b.data}}});
  return r.fallback();
 });
 await page.getByRole('button',{name:'Find my pickup',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Pickup'});
 await dialog.getByRole('button',{name:'Choose a company stop instead'}).click();
 await dialog.getByRole('button',{name:/^True Blue/}).click();
 await dialog.getByRole('button',{name:'Confirm pickup',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText("Couldn't save your pickup");
 expect(await page.evaluate(()=>localStorage.getItem('tt_staff_pickup'))).toBe('Grand Anse');
 await expect(dialog.getByRole('button',{name:'Confirm pickup',exact:true})).toBeEnabled();
 fail=false;
 await dialog.getByRole('button',{name:'Confirm pickup',exact:true}).click();
 await expect(dialog).toHaveCount(0);
});


test('admin overview filters actual companies and opens existing vehicle form',async({page})=>{
 await session(page,'admin');
 const now=new Date().toISOString();
 await page.route('**/functions/entityAccess',r=>{
  const b=r.request().postDataJSON();let result=[];
  if(b.entity==='User')result={id:'caller',role:'admin',email:'admin@test.invalid'};
  if(b.entity==='Vehicle')result=vehicles;
  if(b.entity==='Company')result=[{id:'a',name:'Company A'},{id:'b',name:'Company B'}];
  if(b.entity==='KioskDevice')result=[
   {id:'ka',label:'Tablet A',company_id:'a',vehicle_id:'bus-a',status:'active',paired:true,last_seen:now,helper_health:{reported_at:now,reader:'connected',battery:80}},
   {id:'kb',label:'Tablet B',company_id:'b',vehicle_id:'bus-b',status:'active',paired:true,last_seen:now,helper_health:{reported_at:now,reader:'Not plugged in',battery:80}}
  ];
  return r.fulfill({json:{result}});
 });
 await page.goto('/admin');
 const fleet=page.getByRole('region',{name:'Fleet status',exact:true});
 const health=page.getByRole('region',{name:'Tablet health',exact:true});
 await expect(fleet).toContainText('Bus A');
 await expect(fleet).toContainText('Bus B');
 await expect(health).toContainText('Helper reporting');
 await expect(health).toContainText('Reader: Not plugged in');
 await page.getByLabel('Overview company',{exact:true}).click();
 await page.getByRole('option',{name:'Company A',exact:true}).click();
 await expect(fleet).toContainText('Bus A');
 await expect(fleet).not.toContainText('Bus B');
 await expect(health).toContainText('Tablet A');
 await expect(health).not.toContainText('Tablet B');
 await page.getByRole('button',{name:'Add vehicle',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await expect(page).toHaveURL(/admin\/vehicles/);
});

test('admin overview fits a phone and opens grouped navigation',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await session(page,'admin');
 await page.goto('/admin');
 await expect(page.getByRole('region',{name:'Fleet status',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:'/tmp/tt-admin-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Open menu',exact:true}).click();
 await page.getByRole('button',{name:'People & access',exact:true}).click();
 await page.getByRole('button',{name:'Drivers',exact:true}).click();
 await expect(page).toHaveURL(/admin\/drivers/);
});


test('admin tool search routes to existing maintenance tools',async({page})=>{
 await session(page,'admin');
 await page.goto('/admin');
 await page.getByLabel('Search admin',{exact:true}).fill('faults');
 await page.getByRole('button',{name:'Faults',exact:true}).click();
 await expect(page).toHaveURL(/admin\/faults/);
 await expect(page.getByRole('navigation',{name:'Admin'}).getByRole('button',{name:'Maintenance',exact:true})).toHaveAttribute('aria-expanded','true');
});

test('system theme follows device changes without saving an automatic preference',async({page})=>{
 await session(page,'admin');
 await page.emulateMedia({colorScheme:'light'});
 await page.goto('/privacy');
 await expect(page.locator('html')).toHaveClass(/light/);
 expect(await page.evaluate(()=>localStorage.getItem('tt-theme-v2'))).toBeNull();
 await page.emulateMedia({colorScheme:'dark'});
 await expect(page.locator('html')).toHaveClass(/dark/);
 await page.evaluate(()=>localStorage.setItem('tt-theme-v2','light'));
 await page.reload();
 await expect(page.locator('html')).toHaveClass(/light/);
});

test('mobile overview company picker is a drawer with selectable options',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await session(page,'admin');
 await page.goto('/admin');
 await page.getByLabel('Overview company',{exact:true}).click();
 const drawer=page.getByRole('dialog');
 await expect(drawer).toBeVisible();
 await page.screenshot({path:'/tmp/tt-choice-drawer.png',animations:'disabled'});
 await drawer.getByRole('option',{name:'Company A',exact:true}).click();
 await expect(drawer).toHaveCount(0);
 await expect(page.getByLabel('Overview company',{exact:true})).toContainText('Company A');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('admin refresh reads lists again and preserves saved offline work',async({page})=>{
 const {calls}=await session(page,'admin');
 await page.addInitScript(()=>localStorage.setItem('tt_refresh_canary','saved offline work'));
 await page.goto('/admin');
 await expect(page.getByRole('region',{name:'Fleet status'})).toBeVisible();
 const initial=calls.filter(c=>c.entity==='Vehicle'&&c.operation==='list').length;
 await page.getByRole('button',{name:'Refresh list',exact:true}).click();
 await expect.poll(()=>calls.filter(c=>c.entity==='Vehicle'&&c.operation==='list').length).toBeGreaterThan(initial);
 expect(await page.evaluate(()=>localStorage.getItem('tt_refresh_canary'))).toBe('saved offline work');
});

test('chat shows sending immediately and retains text after a failed send',async({page})=>{
 await session(page,'admin');
 let release;
 await page.route('**/functions/entityAccess',async r=>{
  const b=r.request().postDataJSON();
  if(b.entity==='GroupMessage'&&b.operation==='create'){
   await new Promise(resolve=>release=resolve);
   return r.fulfill({status:500,json:{error:'Test failure'}});
  }
  return r.fallback();
 });
 await page.goto('/admin');
 await page.getByRole('button',{name:'Open messages',exact:true}).click();
 await page.getByRole('button',{name:'New message',exact:true}).click();
 await page.getByRole('button',{name:/Bus A.*No messages/}).click();
 await page.getByRole('button',{name:/Passengers.*No messages/}).click();
 const input=page.getByPlaceholder("Message this bus's passengers…");
 await input.fill('Keep my unsent message');
 await page.getByRole('button',{name:'Send message',exact:true}).click();
 await expect(page.getByText('Keep my unsent message',{exact:true})).toBeVisible();
 await expect(page.getByText('· Sending…',{exact:false})).toBeVisible();
 release();
 await expect(page.getByRole('alert').filter({hasText:"Couldn't send"})).toBeVisible();
 await expect(input).toHaveValue('Keep my unsent message');
 await expect(page.getByText('· Not sent',{exact:false})).toBeVisible();
});

test('pull gesture refreshes once and cancelled gestures preserve the current list',async({page})=>{
 const {calls}=await session(page,'admin');
 await page.setViewportSize({width:390,height:844});
 await page.goto('/admin');
 const panel=page.getByRole('region',{name:'Fleet overview'});
 await expect(panel).toBeVisible();
 const vehicleLists=()=>calls.filter(c=>c.entity==='Vehicle'&&c.operation==='list').length;
 // The page's own load, then the live list's first check 1.5 s later (FIRST_POLL_MS in scopedEntities).
 await expect.poll(vehicleLists,{timeout:8000}).toBeGreaterThanOrEqual(2);
 const initial=vehicleLists();
 const gesture=async(cancel)=>panel.evaluate((el,cancel)=>{
  const emit=(type,y)=>el.dispatchEvent(new TouchEvent(type,{bubbles:true,touches:type==='touchend'||type==='touchcancel'?[]:[new Touch({identifier:1,target:el,clientX:100,clientY:y})]}));
  emit('touchstart',200);emit('touchmove',350);emit(cancel?'touchcancel':'touchend',350);
 },cancel);
 await gesture(true);
 await expect(page.getByRole('button',{name:'Refresh list',exact:true})).toBeEnabled();
 expect(calls.filter(c=>c.entity==='Vehicle'&&c.operation==='list').length).toBe(initial);
 await gesture(false);
 await expect.poll(()=>calls.filter(c=>c.entity==='Vehicle'&&c.operation==='list').length).toBe(initial+1);
});

test('reference bus directory filters real records and keeps bus selection',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await passengerShowcase(page);
 const live={id:'actual-live',name:'Actual live bus',capacity:25,current_lat:12.02,current_lng:-61.76,tracking_active:true,last_location_update:new Date().toISOString(),status:'on_trip',image_url:'/images/transit-bus-3d.webp'};
 const parked={id:'actual-parked',name:'Actual parked bus',capacity:18,tracking_active:false,status:'idle'};
 await page.route('**/functions/entityAccess',r=>r.request().postDataJSON().entity==='Vehicle'?r.fulfill({json:{result:[live,parked]}}):r.fallback());
 await page.goto('/buses');
 await expect(page.getByText('Actual live bus',{exact:true})).toBeVisible();
 await expect(page.getByText('Actual parked bus',{exact:true})).toBeVisible();
 await expect(page.locator('img[src="/images/transit-bus-3d.webp"]')).toBeVisible();
 await page.getByRole('button',{name:'On route',exact:true}).click();
 await expect(page.getByText('Actual parked bus',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Parked',exact:true}).click();
 await expect(page.getByText('Actual live bus',{exact:true})).toHaveCount(0);
 await expect(page.getByText('18 seats')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'/tmp/tt-buses-reference.png'});
 await page.getByRole('link',{name:/Actual parked bus/}).click();
 await expect(page).toHaveURL(/route-explorer\?bus=actual-parked/);
 await page.goto('/route-explorer?bus=actual-live');
 await expect(page.getByRole('button',{name:'View bus',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'View bus',exact:true}).click();
 await expect(page.getByRole('region',{name:'Routes and buses'}).getByRole('button').first()).toHaveAttribute('aria-expanded','true');
});

test('passenger arrival alerts stay off when notification setup fails',async({page})=>{
 await page.addInitScript(()=>{
  const api={permission:'default',requestPermission:async()=>{api.permission='denied';return 'denied';}};
  Object.defineProperty(window,'Notification',{value:api,configurable:true});
 });
 await passengerShowcase(page);
 const updates=[];
 await page.route('**/functions/entityAccess',r=>{
  const b=r.request().postDataJSON();
  if(b.entity==='User' && b.operation==='update'){updates.push(b.data);return r.fulfill({json:{result:{id:'caller',...b.data}}});}
  return r.fallback();
 });
 await page.getByRole('button',{name:/Notify me/}).click();
 await expect(page.getByText('Notifications are blocked',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:/Notify me/})).toHaveAttribute('aria-pressed','false');
 expect(updates.some(data=>data.stop_alerts===true)).toBe(false);
 await expect(page.getByText('Stop alerts on',{exact:true})).toHaveCount(0);
});

test('arrival settings are available through More without cluttering pickup',async({page})=>{
 await passengerShowcase(page);
 await page.goto('/more');
 await page.getByRole('link',{name:/^Notifications Arrival alerts/}).click();
 const dialog=page.getByRole('dialog',{name:'Notifications'});
 await expect(dialog.getByRole('switch',{name:'Alert me when a bus is one stop away'})).toBeVisible();
 await expect(dialog.getByRole('button',{name:'Switch company'})).toBeVisible();
 await expect(dialog.getByRole('link',{name:'View company announcements'})).toBeVisible();
});

for (const width of [320,390,430]) {
 for (const parked of [false,true]) {
  test('arrival card has no overlapping text or bus at '+width+'px '+(parked?'parked':'live'),async({page})=>{
   await page.setViewportSize({width,height:844});
   await passengerShowcase(page,{parked});
   const card=page.locator('.tt-arrival-reference');
   if(parked) await expect(card.getByText('Not started',{exact:true})).toBeVisible();
   const estimate=await card.locator('.tt-arrival-estimate').boundingBox();
   const identity=await card.locator('.tt-arrival-main>div:first-child').boundingBox();
   const art=await card.locator(':scope>.tt-arrival-art').boundingBox();
   expect(estimate.y+estimate.height).toBeLessThanOrEqual(identity.y);
   expect(identity.y+identity.height).toBeLessThanOrEqual(art.y);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
   if(width===390&&parked)await page.screenshot({path:'/tmp/tt-arrival-fixed.png',fullPage:true});
  });
 }
}

test('desktop setup buttons open the requested native view directly',async({page})=>{
 await session(page,'admin');
 await page.addInitScript(()=>{window.setupCalls=[];window.transittrackDesktop={openSetup:async view=>{window.setupCalls.push(view);return {ok:true};}};});
 await page.route('**/functions/nfcCards',r=>r.fulfill({json:{people:[],cards:[],vehicles:[],tablets:[]}}));
 await page.goto('/admin/cards');
 await page.getByRole('button',{name:'NFC setup',exact:true}).click();
 expect(await page.evaluate(()=>window.setupCalls)).toEqual(['nfc']);
 await page.getByRole('button',{name:'Connect reader',exact:true}).click();
 expect(await page.evaluate(()=>window.setupCalls)).toEqual(['nfc','nfc']);
 await page.goto('/admin/kiosks');
 await page.getByRole('button',{name:'Open tablet setup',exact:true}).click();
 expect(await page.evaluate(()=>window.setupCalls)).toEqual(['tablet']);
});
test('native setup opens focused NFC view and switches to tablet without running operations',async({page})=>{
 await page.addInitScript(()=>{window.nativeCalls=[];window.deviceSetup={onView:()=>{},onReaderEvent:()=>{},run:async action=>{window.nativeCalls.push(action);return {message:'Ready'};}};});
 await page.goto('file:///app/desktop/setup.html#nfc');
 await expect(page.getByRole('heading',{name:'NFC reader setup',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Start reader',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Find tablets',exact:true})).toBeHidden();
 expect(await page.evaluate(()=>window.nativeCalls)).toEqual([]);
 await page.getByRole('button',{name:'Tablet setup',exact:true}).click();
 await expect(page.getByRole('button',{name:'Find tablets',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Start reader',exact:true})).toBeHidden();
 expect(await page.evaluate(()=>window.nativeCalls)).toEqual([]);
 await page.getByRole('button',{name:'NFC reader setup',exact:true}).click();
 await page.getByRole('button',{name:'Start reader',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.nativeCalls)).toEqual(['startReader']);
});

test('older desktop restart restores a valid saved session instead of showing login',async({page})=>{
 await session(page,'admin');
 await page.addInitScript(()=>Object.defineProperty(navigator,'userAgent',{get:()=> 'TransitTrack Electron/44.7.0'}));
 await page.goto('/login?returnTo=%2F');
 await expect(page).toHaveURL(/\/admin$/);
 await expect(page.getByLabel('Email address')).toHaveCount(0);
 await page.goto('/login?returnTo=%2F');
 await expect(page).toHaveURL(/\/admin$/);
 expect(await page.evaluate(()=>localStorage.getItem('base44_access_token'))).toBe('mock-authenticated-session');
});
test('desktop explicit switch account still opens the sign-in form',async({page})=>{
 await session(page,'admin');
 await page.addInitScript(()=>Object.defineProperty(navigator,'userAgent',{get:()=> 'TransitTrack Electron/44.7.0'}));
 await page.goto('/login');
 await expect(page.getByLabel('Email address')).toBeVisible();
 await expect(page).toHaveURL(/\/login$/);
});
for(const status of [401,503]){
 test('desktop restart handles session response '+status+' without bypassing authentication',async({page})=>{
  await session(page,'admin');
  await page.addInitScript(()=>Object.defineProperty(navigator,'userAgent',{get:()=> 'TransitTrack Electron/44.7.0'}));
  await page.route('**/functions/entityAccess',r=>{
   const b=r.request().postDataJSON();
   if(b.entity==='User'&&b.id==='me')return r.fulfill({status,json:{error:status===401?'Authentication required':'Temporarily unavailable'}});
   return r.fallback();
  });
  await page.goto('/login?returnTo=%2F');
  if(status===401)await expect(page.getByLabel('Email address')).toBeVisible();
  else{
   await expect(page.getByRole('alert').getByText("Couldn't check your sign-in",{exact:true})).toBeVisible();
   await expect(page.getByLabel('Email address')).toHaveCount(0);
  }
  expect(await page.evaluate(()=>localStorage.getItem('base44_access_token'))).toBe('mock-authenticated-session');
  await expect(page).toHaveURL(/\/login\?returnTo=/);
 });
}

test('welcome waits for Google callback session verification before opening account',async({page})=>{
 await session(page,'admin');
 let release;
 const gate=new Promise(resolve=>{release=resolve;});
 await page.route('**/functions/entityAccess',async r=>{
  const b=r.request().postDataJSON();
  if(b.entity==='User'&&b.id==='me')await gate;
  return r.fallback();
 });
 await page.goto('/?access_token=mock-google-callback');
 await expect(page.getByText('Opening your app…',{exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:/^Sign in/})).toHaveCount(0);
 release();
 await expect(page).toHaveURL(/\/admin$/);
 expect(await page.evaluate(()=>localStorage.getItem('base44_access_token'))).toBe('mock-google-callback');
});

test('welcome shows recovery after Google callback verification failure and retry opens account',async({page})=>{
 await session(page,'admin');
 let failing=true;
 await page.route('**/functions/entityAccess',r=>{
  const b=r.request().postDataJSON();
  if(failing&&b.entity==='User'&&b.id==='me')return r.fulfill({status:503,json:{error:'Temporarily unavailable'}});
  return r.fallback();
 });
 await page.goto('/?access_token=mock-google-callback');
 await expect(page.getByRole('alert').getByText("Couldn't check your sign-in",{exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:/^Sign in/})).toHaveCount(0);
 expect(await page.evaluate(()=>localStorage.getItem('base44_access_token'))).toBe('mock-google-callback');
 failing=false;
 await page.getByRole('button',{name:/Try again/i}).click();
 await expect(page).toHaveURL(/\/admin$/);
});
