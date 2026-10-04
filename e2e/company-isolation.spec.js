import {test,expect} from '@playwright/test';
const vehicles=[{id:'bus-a',name:'Bus A',company_id:'a',company_name:'Company A',type:'staff_bus',status:'idle',capacity:25},{id:'bus-b',name:'Bus B',company_id:'b',company_name:'Company B',type:'staff_bus',status:'idle',capacity:25}];
async function session(page,role) {
 const calls=[],direct=[];
 await page.addInitScript(()=>localStorage.setItem('base44_access_token','mock-authenticated-session'));
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
 await page.getByRole('button',{name:/^My pickup/}).click();
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
  await page.route('**/functions/entityAccess',r=>{
    const b=r.request().postDataJSON();let result=[];
    if(b.entity==='User') result=passenger;
    if(b.entity==='Vehicle') result=[bus,{...bus,id:'bus-c',name:'TT-108'}];
    if(b.entity==='Route') result=[{id:'route-a',company_id:'a',name:'Coastal route',active:true,stops}];
    return r.fulfill({json:{result}});
  });
  await page.route('https://api.mapbox.com/**',r=>r.fulfill({json:{routes:[{duration:180,distance:1500,geometry:{coordinates:stops.map(s=>[s.lng,s.lat])},legs:[{duration:180,distance:1500,steps:[]}]}]}}));
  await page.route('**/api.open-meteo.com/**',r=>r.fulfill({json:{current:{temperature_2m:28,weather_code:0}}}));
  await page.goto('/staff');
  await expect(page.getByLabel('Your bus',{exact:true})).toBeVisible();
}

test('approved passenger layout preserves live map and timeline on desktop',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});
  await passengerShowcase(page);
  await expect(page.getByLabel('Route stops')).toBeVisible();
  await expect(page.getByRole('button',{name:/Notify me/})).toBeVisible();
  await expect(page.getByLabel('Your bus',{exact:true}).getByRole('status')).toContainText('Live');
  const hero=await page.getByLabel('Your bus',{exact:true}).boundingBox();
  const map=await page.locator('#passenger-live-map').boundingBox();
  expect(map.x).toBeGreaterThan(hero.x+hero.width);
  await expect.poll(()=>page.locator('img[src="/images/transit-bus-3d.webp"]').first().evaluate(img=>img.complete && img.naturalWidth>0)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'/tmp/tt-passenger-desktop.png',fullPage:true});
});

test('approved passenger mobile layout keeps four navigation items and more menu',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await passengerShowcase(page,{light:true});
  await expect(page.locator('html')).toHaveClass(/light/);
  const nav=page.getByRole('navigation',{name:'Passenger sections'});
  for(const name of ['Home','Map','Buses','More'])await expect(nav.getByRole('button',{name,exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'/tmp/tt-passenger-mobile.png',fullPage:true});
  await nav.getByRole('button',{name:'More',exact:true}).click();
  await expect(page.getByRole('button',{name:'Messages',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'My account',exact:true})).toBeVisible();
});

test('passenger showcase keeps delayed GPS distinct from live arrival',async({page})=>{
  await passengerShowcase(page,{stale:true});
  const card=page.getByLabel('Your bus',{exact:true});
  await expect(card.getByRole('status')).toContainText('Location delayed');
  await expect(card.getByText('Location delayed',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Route stops')).toBeVisible();
});

test('admin showcase keeps metrics, fleet list and working section navigation',async({page})=>{
  await session(page,'admin');
  await page.addInitScript(()=>localStorage.setItem('tt-map-engine','basic'));
  await page.route('https://api.mapbox.com/**',r=>r.fulfill({status:404,body:''}));
  await page.goto('/admin');
  await expect(page.getByRole('region',{name:'Live fleet overview'})).toBeVisible();
  await expect(page.getByText('Live now',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'/tmp/tt-admin-desktop.png',fullPage:true});
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
 await page.getByRole('button',{name:'Menu',exact:true}).click();
 const item=page.getByRole('button',{name:'Maintenance Schedule',exact:true});
 await expect(item).toHaveCSS('text-align','left');
});
