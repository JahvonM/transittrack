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
 await page.getByLabel('Card holder',{exact:true}).selectOption('user:email-passenger');
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
 await page.getByRole('button',{name:/^Pickup settings/}).click();
 await page.getByRole('button',{name:'Use where I am now',exact:true}).click();
 await expect(page.getByText('Walk east to the main road',{exact:true})).toBeVisible();
 expect(saved.filter(d=>d.pickup_lat!==undefined)).toHaveLength(0);
 await page.getByRole('button',{name:'Use this pickup point',exact:true}).click();
 await expect.poll(()=>saved.filter(d=>d.pickup_lat!==undefined).length).toBe(1);
 const pickup=saved.find(d=>d.pickup_lat!==undefined);
 expect(pickup.pickup_lat).toBeCloseTo(12.005);
 expect(pickup.pickup_lng).toBeCloseTo(-61.7);
 expect(pickup.home_lng).toBeCloseTo(-61.701);
 expect(pickup.pickup_route_id).toBe('route-a');
});

async function passengerShowcase(page, { stale = false, light = false } = {}) {
  await session(page,'staff');
  await page.addInitScript(({light}) => {
    localStorage.setItem('tt_company_access_grant','a'.repeat(64));
    localStorage.setItem('tt_staff_pickup','Grand Anse');
    localStorage.setItem('tt-map-engine','basic');
    localStorage.setItem('tt-theme-v2',light ? 'light' : 'dark');
  }, {light});
  const passenger={id:'caller',role:'staff',email:'caller@test.local',full_name:'Test Passenger',company_id:'a',favorite_stop:'Grand Anse'};
  const stops=[{name:"St. George's",lat:12.05,lng:-61.75,order:0},{name:'True Blue',lat:12.02,lng:-61.76,order:1},{name:'Grand Anse',lat:12.01,lng:-61.77,order:2},{name:'Morne Rouge',lat:12,lng:-61.78,order:3}];
  const bus={...vehicles[0],name:'TT-102',route_id:'route-a',current_lat:12.022,current_lng:-61.758,tracking_active:true,status:'on_trip',speed:25,driver_name:'K. Thomas',last_location_update:new Date(Date.now()-(stale ? 600000 : 20000)).toISOString()};
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
  await page.goto('/staff');
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
 await page.getByRole('button',{name:/^Pickup settings/}).click();
 await page.getByRole('button',{name:'Use where I am now',exact:true}).click();
 await expect(page.getByText(/^Spot 1 of [2-9] near you$/)).toBeVisible();
 await page.getByRole('button',{name:'Show another spot nearby'}).click();
 await expect(page.getByText(/^Spot 2 of [2-9] near you$/)).toBeVisible();
 await page.getByRole('button',{name:'Use this pickup point',exact:true}).click();
 await expect.poll(()=>saved.filter(d=>d.pickup_lat!==undefined).length).toBe(1);
 const second=saved.find(d=>d.pickup_lat!==undefined);
 expect(Math.abs(second.pickup_lat-12.005)).toBeGreaterThan(0.0009);
 expect(second.pickup_lng).toBeCloseTo(-61.7);
 // Their own pin: off the road gets a warning, on the road saves with the route.
 // Saving keeps the pickup sheet open on the saved spot; close it first.
 // The sheet can still be settling after the save, so press until it closes.
 await expect(async()=>{ await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0,{timeout:1000}); }).toPass({timeout:10000});
 await page.getByRole('region',{name:'Your pickup'}).getByRole('button',{name:'Change'}).click();
 await page.getByRole('button',{name:'Pick my own spot on the map'}).click();
 const box=page.getByRole('region',{name:'Pick your own pickup spot'});
 await box.getByLabel('Latitude').fill('12.004');
 await box.getByLabel('Longitude').fill('-61.702');
 await expect(box.getByText(/m from the Main road route road/)).toBeVisible();
 await box.getByLabel('Longitude').fill('-61.7001');
 await expect(box.getByText('On the Main road route road.')).toBeVisible();
 await box.getByLabel('Name this spot').fill('Outside the blue shop');
 await box.getByRole('button',{name:'Use this spot',exact:true}).click();
 await expect.poll(()=>saved.filter(d=>d.pickup_name==='Outside the blue shop').length).toBe(1);
 const mine=saved.find(d=>d.pickup_name==='Outside the blue shop');
 expect(mine).toMatchObject({pickup_lat:12.004,pickup_lng:-61.7001,pickup_route_id:'route-a'});
});

test('passenger Home puts the roadside pickup up front and shows the workplace drop-off',async({page})=>{
  const showcase=await passengerShowcase(page);
  const cta=page.getByRole('region',{name:'Get picked up near home'});
  await expect(cta).toBeVisible();
  await cta.getByRole('button',{name:'Find my pickup',exact:true}).click();
  await expect(page.getByText('Find a roadside pickup',{exact:true})).toBeVisible();
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
  // Card designer sits under All tools > Fleet Operations; groups stay closed until tapped.
  await page.getByRole('button',{name:'All tools',exact:true}).click();
  await expect(page.getByRole('button',{name:'Card designer',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Fleet Operations',exact:true}).click();
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
 // ui-redesign: main sections are always listed; the rest sit under "All tools",
 // which opens itself when the current section is one of them. Messages and the
 // AI assistant sit side by side in the page header instead of floating.
 await session(page,'admin');
 await page.goto('/admin/drivers');
 const nav=page.getByRole('navigation',{name:'Admin'});
 await expect(nav.getByRole('button',{name:'Drivers',exact:true})).toHaveAttribute('aria-current','page');
 const tools=nav.getByRole('button',{name:'All tools',exact:true});
 await expect(tools).toHaveAttribute('aria-expanded','false');
 await page.goto('/admin/card-designs');
 await expect(tools).toHaveAttribute('aria-expanded','true');
 await expect(nav.getByRole('button',{name:'Card designer',exact:true})).toHaveAttribute('aria-current','page');
 // Only the group holding the current page is open; the others wait for a tap.
 await expect(nav.getByRole('button',{name:'Fleet Operations',exact:true})).toHaveAttribute('aria-expanded','true');
 const admin=nav.getByRole('button',{name:'Admin',exact:true});
 await expect(admin).toHaveAttribute('aria-expanded','false');
 await expect(nav.getByRole('button',{name:'Change history',exact:true})).toHaveCount(0);
 await admin.click();
 await expect(nav.getByRole('button',{name:'Change history',exact:true})).toBeVisible();
 await tools.click();
 await expect(tools).toHaveAttribute('aria-expanded','false');
 const header=page.getByRole('banner');
 const messages=header.getByRole('button',{name:'Open messages',exact:true});
 const ai=header.getByRole('button',{name:'Open AI assistant',exact:true});
 await expect(messages).toBeVisible();
 await expect(ai).toBeVisible();
 const m=await messages.boundingBox(),a=await ai.boundingBox();
 expect(m.x+m.width).toBeLessThanOrEqual(a.x);
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
  if(/UploadFile/i.test(r.request().url()))return r.fulfill({json:{file_url:'https://test.invalid/company-logo.png'}});
  return r.fallback();
 });
 await page.route('**/functions/entityAccess',async r=>{
  const b=r.request().postDataJSON();
  if(b.entity==='Company'&&b.operation==='create'){saved=b.data;return r.fulfill({json:{result:{id:'new-company',...b.data}}});}
  return r.fallback();
 });
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
 await expect(page.getByText('All company buses',{exact:true})).toBeVisible();
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
