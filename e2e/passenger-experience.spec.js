import {test,expect} from '@playwright/test';
const tab=(page,name)=>page.getByRole(page.viewportSize().width<768?'button':'link',{name,exact:true});
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
async function passengerShowcase(page, { stale = false, light = false, parked = false, assigned = { current: true }, pickup = 'Grand Anse', extra = {}, sharedStop = null, busExtra = {}, routeList = null, driveSecs = 180 } = {}) {
  await session(page,'staff');
  await page.addInitScript(({light,pickup}) => {
    localStorage.setItem('tt_company_access_grant','a'.repeat(64));
    if (pickup) localStorage.setItem('tt_staff_pickup',pickup);
    localStorage.setItem('tt-map-engine','basic');
    localStorage.setItem('tt-theme-v2',light ? 'light' : 'dark');
  }, {light,pickup});
  const passenger={id:'caller',role:'staff',email:'caller@test.local',full_name:'Test Passenger',company_id:'a',...(pickup ? {favorite_stop:pickup} : {}),...extra};
  // Where this passenger's pickup was merged with neighbours' along the road.
  await page.route('**/functions/routeStops',r=>r.fulfill({json:{stop:sharedStop}}));
  const stops=[{name:"St. George's",lat:12.05,lng:-61.75,order:0},{name:'True Blue',lat:12.02,lng:-61.76,order:1},{name:'Grand Anse',lat:12.01,lng:-61.77,order:2},{name:'Morne Rouge',lat:12,lng:-61.78,order:3}];
  const bus={...vehicles[0],name:'TT-102',route_id:'route-a',current_lat:12.022,current_lng:-61.758,tracking_active:!parked,status:parked ? 'active' : 'on_trip',speed:parked ? 0 : 25,driver_name:'K. Thomas',last_location_update:new Date(Date.now()-(stale ? 600000 : 20000)).toISOString(),...busExtra};
  // The bus Admin → Passengers put this passenger on; null once it's removed.
  await page.route('**/functions/companyAccess',r=>r.fulfill({json:{company:{id:'a',name:'Grenada Transport Co.'},my_bus:assigned.current ? {id:bus.id,name:bus.name} : null}}));
  const buses=[bus,{...bus,id:'bus-c',name:'TT-108'}];
  const routes=routeList || [{id:'route-a',company_id:'a',name:'Coastal route',active:true,stops}];
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
  await page.route('https://api.mapbox.com/**',r=>driveSecs==null?r.fulfill({status:503,body:''}):r.fulfill({json:{routes:[{duration:driveSecs,distance:1500,geometry:{coordinates:stops.map(s=>[s.lng,s.lat])},legs:[{duration:driveSecs,distance:1500,steps:[]}]}]}}));
  await page.route('**/api.open-meteo.com/**',r=>r.fulfill({json:{current:{temperature_2m:28,weather_code:0}}}));
  await page.goto('/staff');
  await expect(page.getByLabel('Your next bus',{exact:true})).toBeVisible();
  return state;
}

test('four passenger tabs retain data and open map only on request',async({page})=>{
 await page.setViewportSize({width:390,height:844});await passengerShowcase(page,{pickup:'Morne Rouge'});
 await page.route('**/functions/passengerAccount',r=>r.fulfill({json:{card:{issued:true,active:true,status:'Active'},history:[{id:'mine',vehicle_name:'TT-102',status:'boarded',boarded_at:'2026-10-11T10:00:00Z'}]}}));
 await page.route('**/functions/generateBoardingQr',r=>r.fulfill({json:{token:'TEST-QR'}}));
 await expect(page.getByLabel('Your next bus')).toBeVisible();
 await expect(page.getByLabel('Bus arrival details')).toContainText('Estimated pickup');
 await expect(page.getByLabel('Bus arrival details')).toContainText('1 stop away');
 await expect(page.getByLabel('Live journey map')).toHaveCount(0);
 await tab(page,'Journey').click();
 await expect(page.getByRole('button',{name:'View live map',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'View live map',exact:true}).click();
 await expect(page.getByLabel('Live journey map')).toBeVisible();
 await page.getByRole('button',{name:'Hide live map',exact:true}).click();
 await tab(page,'My card').click();
 await expect(page.getByText('Issued · Active',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Report lost card'})).toBeEnabled();
 await tab(page,'More').click();
 await expect(page.getByRole('heading',{name:'Your account'})).toBeVisible();
 await expect(page.getByText('Offline access',{exact:true})).toBeVisible();
 await tab(page,'Home').click();
 await expect(page.getByLabel('Your next bus')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'/tmp/passenger-applied-home.png',fullPage:true});
});
for(const width of [320,430,768])test('passenger layout fits '+width,async({page})=>{
 await page.setViewportSize({width,height:950});await passengerShowcase(page);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const hero=page.getByLabel('Your next bus');await expect(hero).toBeVisible();
 await tab(page,'Journey').click();
 await expect(page.getByRole('button',{name:'View live map',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('the passenger can tell their driver they are running late or skipping today',async({page})=>{
 await page.setViewportSize({width:390,height:844});await passengerShowcase(page);
 const me={id:'caller',role:'staff',email:'caller@test.local',full_name:'Test Passenger',company_id:'a',favorite_stop:'Grand Anse'};
 const updates=[];
 await page.route('**/functions/entityAccess',r=>{
  const b=r.request().postDataJSON();
  if(b.entity!=='User')return r.fallback();
  if(b.operation==='update'){updates.push(b.data);Object.assign(me,b.data);}
  return r.fulfill({json:{result:me}});
 });
 const flags=page.getByRole('group',{name:'Tell your driver'});
 await flags.getByRole('button',{name:"I'm running late"}).click();
 await expect(flags.getByRole('button',{name:/^Running late/})).toHaveAttribute('aria-pressed','true');
 await expect(flags.getByText(/^Until /)).toBeVisible();
 // The button flips at once; the save reaches the server a moment later.
 await expect.poll(()=>updates.length).toBe(1);
 expect(updates[0]).toMatchObject({late_snooze_active:true});
 expect(Date.parse(updates[0].late_until)).toBeGreaterThan(Date.now());
 await flags.getByRole('button',{name:'Skip today'}).click();
 await expect(flags.getByRole('button',{name:/^Skipping today/})).toHaveAttribute('aria-pressed','true');
 await expect(flags.getByText('Back on tomorrow')).toBeVisible();
 await expect.poll(()=>updates.length).toBe(2);
 expect(updates[1]).toMatchObject({skip_pickup_today:true});
 // Tapping again turns it back off.
 await flags.getByRole('button',{name:/^Running late/}).click();
 await expect(flags.getByRole('button',{name:"I'm running late"})).toHaveAttribute('aria-pressed','false');
 await expect.poll(()=>updates.length).toBe(3);
 expect(updates[2]).toMatchObject({late_snooze_active:false,late_until:null});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await flags.evaluate(el=>el.scrollIntoView({block:'center'}));
 await flags.screenshot({path:'/tmp/passenger-running-late.png'});
});
test('passenger sheets follow the finger: pulled down they close, pulled up they stay',async({page})=>{
 await page.setViewportSize({width:390,height:844});await passengerShowcase(page);
 const open=async()=>{
  await page.getByRole('region',{name:'Pickup and drop-off'}).getByRole('button',{name:'Change'}).click();
  const sheet=page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(600); // let it finish opening
  return sheet;
 };
 const drag=async(sheet,dy)=>{
  const box=await sheet.boundingBox();
  const x=box.x+box.width/2,y=box.y+12; // the grab handle
  await page.mouse.move(x,y);await page.mouse.down();
  await page.mouse.move(x,y+dy,{steps:12});await page.mouse.up();
 };
 // The page scrolls under the frosted tab bar.
 await page.mouse.wheel(0,260);await page.waitForTimeout(400);
 await page.screenshot({path:'/tmp/passenger-frosted-tabs.png'});
 let sheet=await open();
 const top=(await sheet.boundingBox()).y;
 // A short, slow pull follows the finger, then settles back open (a quick
 // flick the same distance would close it).
 {
  const box=await sheet.boundingBox();
  const x=box.x+box.width/2,y=box.y+12;
  await page.mouse.move(x,y);await page.mouse.down();
  for(let i=1;i<=8;i++){await page.mouse.move(x,y+15*i);await page.waitForTimeout(90);}
  expect((await sheet.boundingBox()).y).toBeGreaterThan(top+80);
  await page.screenshot({path:'/tmp/passenger-sheet-drag.png'});
  await page.mouse.up();await page.waitForTimeout(700);
  expect(Math.abs((await sheet.boundingBox()).y-top)).toBeLessThan(2);
 }
 // Pulled up past the top it resists and settles back, still open.
 await drag(sheet,-200);
 await page.waitForTimeout(700);
 await expect(sheet).toBeVisible();
 expect(Math.abs((await sheet.boundingBox()).y-top)).toBeLessThan(2);
 // Pulled well down it closes.
 await drag(sheet,400);
 await expect(page.getByRole('dialog')).toHaveCount(0);
 // The close button still works too.
 sheet=await open();
 await sheet.getByRole('button',{name:'Close'}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('route stops unfold, and the arrow turns toward them',async({page})=>{
 await page.setViewportSize({width:390,height:844});await passengerShowcase(page);
 await tab(page,'Journey').click();
 const toggle=page.getByRole('button',{name:'All route stops'});
 await toggle.click();
 await expect(page.getByRole('button',{name:'Hide route stops'})).toHaveAttribute('aria-expanded','true');
 await expect(page.locator('.px-unfold')).toBeVisible();
 await expect.poll(()=>page.getByRole('button',{name:'Hide route stops'}).locator('svg').last().evaluate(n=>getComputedStyle(n).transform)).not.toBe('none');
 await page.getByRole('button',{name:'Hide route stops'}).click();
 await expect(page.locator('.px-unfold')).toHaveCount(0);
});
test('reduce motion: sheets fade instead of sliding',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.setViewportSize({width:390,height:844});await passengerShowcase(page);
 await page.getByRole('region',{name:'Pickup and drop-off'}).getByRole('button',{name:'Change'}).click();
 const sheet=page.getByRole('dialog');
 await expect(sheet).toBeVisible();
 expect(await sheet.evaluate(n=>getComputedStyle(n).animationName)).toBe('tt-sheet-fade-in');
});
test('return trip uses company pickup and home dropoff',async({page})=>{
 const state=await passengerShowcase(page,{extra:{pickup_name:'My home',pickup_lat:12.01,pickup_lng:-61.77}});
 state.workplace={name:'Hotel entrance',lat:12.05,lng:-61.75};
 await page.route('**/functions/entityAccess',r=>{
 const b=r.request().postDataJSON();
 const result=b.entity==='User'?{id:'caller',role:'staff',email:'caller@test.local',full_name:'Test Passenger',favorite_stop:'Grand Anse',pickup_name:'My home',pickup_lat:12.01,pickup_lng:-61.77}:b.entity==='Bootstrap'?{workplace:state.workplace,vehicles:[{...vehicles[0],name:'TT-102',route_id:'route-a',trip_direction:'to_home',tracking_active:true,status:'on_trip',current_lat:12.05,current_lng:-61.75,last_location_update:new Date().toISOString()}],routes:[],trips:[]}: [];
 return r.fulfill({json:{result}});
 });
 await page.reload();await expect(page.getByLabel('Your next bus')).toBeVisible();
 await tab(page,'Journey').click();
 await expect(page.getByLabel('Pickup and drop-off')).toContainText('Hotel entrance');
 await expect(page.getByLabel('Pickup and drop-off')).toContainText('My home');
});

for(const item of [
 {name:'nearby',lat:12.012,speed:0,label:'Bus close to your stop'},
 {name:'at stop',lat:12.01,speed:5,label:'Bus at your stop'},
 {name:'arrived',lat:12.01,speed:0,label:'Bus arrived'},
])test('passenger card shows '+item.name+' from fresh bus location',async({page})=>{
 await passengerShowcase(page,{busExtra:{current_lat:item.lat,current_lng:-61.77,speed:item.speed}});
 await expect(page.getByLabel('Your next bus').getByRole('status')).toHaveText(item.label);
 await tab(page,'Journey').click();
 await expect(page.locator('.px-bus-identity')).toContainText(item.label);
});
// A route with only a drawn road (Route Planner) and no named stops: the
// passenger's pickup is merged onto the road; the server says where it falls
// in the bus's stop list, the bus says which of its stops is next.
const ROAD=[{lat:12.05,lng:-61.75},{lat:12.02,lng:-61.76},{lat:12.0,lng:-61.78}];
const along=(t)=>({lat:12.05-0.03*t,lng:-61.75-0.01*t});
function drawnRoadPassenger({bus=along(0.1),next=1,driveSecs=600}={}) {
 return {
  pickup:'My pickup', driveSecs,
  extra:{pickup_name:'My pickup',pickup_route_id:'route-a',pickup_lat:along(0.6).lat,pickup_lng:along(0.6).lng-0.0005},
  sharedStop:{name:'Pickup 3',lat:along(0.6).lat,lng:along(0.6).lng,fixed:false,shared_with:1,moved_m:50,order:2,bus_id:'bus-a',bus_order:2},
  routeList:[{id:'route-a',company_id:'a',name:'Country',active:true,stops:[],path:ROAD}],
  busExtra:{current_lat:bus.lat,current_lng:bus.lng,road_next_stop:next},
 };
}
test('drawn road with no named stops: arrival time and stops away',async({page})=>{
 await passengerShowcase(page,drawnRoadPassenger());
 const hero=page.getByLabel('Your next bus');
 await expect(hero).toContainText('10 min');
 await expect(page.getByLabel('Bus arrival details').first()).toContainText('1 stop away');
 await expect(page.getByLabel('Bus arrival details').first()).not.toContainText('unavailable');
});
test('drawn road: a rough arrival time when directions are unavailable',async({page})=>{
 await passengerShowcase(page,drawnRoadPassenger({driveSecs:null}));
 await expect(page.getByLabel('Your next bus')).toContainText(/\d+ min/);
 await expect(page.getByLabel('Bus arrival details').first()).toContainText('Estimated pickup');
 await expect(page.getByLabel('Bus arrival details').first()).not.toContainText('unavailable');
});
test('drawn road: tells the passenger once when the bus is close',async({page})=>{
 await passengerShowcase(page,drawnRoadPassenger({bus:along(0.45),next:2,driveSecs:120}));
 await expect(page.getByLabel('Your next bus').getByRole('status')).toHaveText('Bus close to your stop');
 await expect(page.getByLabel('Bus arrival details').first()).toContainText('Your stop is next');
 await expect(page.getByText('Your bus is close',{exact:true})).toBeVisible();
 await page.reload();
 await expect(page.getByLabel('Your next bus').getByRole('status')).toHaveText('Bus close to your stop');
 await page.waitForTimeout(1000);
 await expect(page.getByText('Your bus is close',{exact:true})).toHaveCount(0);
});
// Choosing a pickup: the one tapped glows and says "Selected" (on the map
// too), and tapping another moves it there, so it's clear which is picked.
test('the pickup a passenger taps glows, and tapping another moves it',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.addInitScript(()=>{ navigator.geolocation.getCurrentPosition=ok=>ok({coords:{latitude:12.021,longitude:-61.7555,accuracy:5}}); });
 await passengerShowcase(page);
 await page.route('https://api.mapbox.com/**',r=>{
  const url=r.request().url();
  if(url.includes('/walking/')){
   // Walks end exactly where they were asked to go.
   const [from,to]=decodeURIComponent(url.split('/walking/')[1].split('?')[0]).split(';').map(p=>p.split(',').map(Number));
   const dist=Math.round(Math.hypot((to[1]-from[1])*111000,(to[0]-from[0])*108000));
   return r.fulfill({json:{routes:[{distance:dist,duration:dist/1.3,geometry:{coordinates:[from,to]},legs:[{steps:[{mode:'walking',maneuver:{instruction:'Walk to the main road'}}]}]}],waypoints:[{location:from},{location:to}]}});
  }
  if(url.includes('/geocoding/'))return r.fulfill({json:{features:[{place_name:'Test home, Grenada'}]}});
  return r.fallback();
 });
 const glows=(el)=>el.evaluate(n=>getComputedStyle(n).boxShadow!=='none');
 await page.getByRole('region',{name:'Pickup and drop-off'}).getByRole('button',{name:'Change'}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByRole('button',{name:'Use my location',exact:true}).click();
 const spots=dialog.getByRole('region',{name:'Nearby pickup spots'}).getByRole('button');
 await expect(spots.nth(2)).toBeVisible();
 await expect(spots.nth(0)).toHaveAttribute('aria-pressed','true');
 await spots.nth(2).click();
 await expect(spots.nth(2)).toHaveAttribute('aria-pressed','true');
 await expect(spots.nth(0)).toHaveAttribute('aria-pressed','false');
 await expect(spots.nth(2)).toContainText('Selected');
 await expect(dialog.getByText('Selected',{exact:true})).toHaveCount(1);
 await expect.poll(()=>glows(spots.nth(2))).toBe(true);
 await expect.poll(()=>glows(spots.nth(0))).toBe(false);
 await expect(dialog.locator('.tt-map-picked')).toHaveCount(1);
 await expect(dialog.locator('.tt-map-picked')).toHaveText('Spot 3 · Your pick');
 // Spots are numbered, the same in the list and on the map.
 const count=await spots.count();
 for(let i=0;i<count;i++) await expect(spots.nth(i).locator('strong')).toHaveText(`Spot ${i+1}`);
 await expect(dialog.locator('.tt-map-num')).toHaveCount(count);
 await expect(dialog.locator('.tt-map-num.picked')).toHaveText('3');
 await page.waitForTimeout(700);
 await page.screenshot({path:'/tmp/tt-pickup-picked.png'});
 await dialog.locator('.leaflet-container').first().screenshot({path:'/tmp/tt-pickup-map.png'});
 await spots.nth(1).click();
 await expect(spots.nth(1)).toHaveAttribute('aria-pressed','true');
 await expect(spots.nth(2)).toHaveAttribute('aria-pressed','false');
 await expect.poll(()=>glows(spots.nth(2))).toBe(false);
 // Tapping a number on the map picks that spot.
 await dialog.locator('.tt-map-num',{hasText:/^1$/}).dispatchEvent('click');
 await expect(spots.nth(0)).toHaveAttribute('aria-pressed','true');
 await expect(spots.nth(1)).toHaveAttribute('aria-pressed','false');
 await expect(dialog.locator('.tt-map-picked')).toHaveText('Spot 1 · Your pick');
 await dialog.getByRole('button',{name:'Review this pickup',exact:true}).click();
 await expect(dialog.getByText(/^Spot 1 · Roadside pickup/)).toBeVisible();
 await dialog.getByRole('button',{name:'Choose another spot',exact:true}).click();
 // Company stops: the same.
 await dialog.getByRole('button',{name:'Choose a company stop instead'}).click();
 await dialog.getByRole('button',{name:/^True Blue/}).click();
 await expect(dialog.getByRole('button',{name:/^True Blue/})).toHaveAttribute('aria-pressed','true');
 await expect(dialog.getByRole('button',{name:/^Grand Anse/})).toHaveAttribute('aria-pressed','false');
 await expect.poll(()=>glows(dialog.getByRole('button',{name:/^True Blue/}))).toBe(true);
 await dialog.getByRole('button',{name:'View stops on map',exact:true}).click();
 await expect(dialog.locator('.tt-map-picked')).toHaveText('True Blue');
 await dialog.getByRole('button',{name:/^Morne Rouge/}).click();
 await expect(dialog.locator('.tt-map-picked')).toHaveText('Morne Rouge');
 await expect(dialog.getByRole('button',{name:/^True Blue/})).toHaveAttribute('aria-pressed','false');
 await dialog.getByRole('button',{name:/^Morne Rouge/}).scrollIntoViewIfNeeded();
 await page.waitForTimeout(700);
 await page.screenshot({path:'/tmp/tt-pickup-stop-picked.png'});
});
// Only the stops on the route of the passenger's bus are offered or used,
// even when another route has a stop with the same name.
const coastalRoute={id:'route-a',company_id:'a',name:'Coastal route',active:true,stops:[{name:"St. George's",lat:12.05,lng:-61.75,order:0},{name:'True Blue',lat:12.02,lng:-61.76,order:1},{name:'Grand Anse',lat:12.01,lng:-61.77,order:2},{name:'Morne Rouge',lat:12,lng:-61.78,order:3}]};
const otherRoute={id:'route-b',company_id:'a',name:'Other route',active:true,stops:[{name:'Stop 5',lat:12.1,lng:-61.7,order:0},{name:'Grand Anse',lat:12.2,lng:-61.6,order:1}]};
async function companyStops(page){
 await page.getByRole('region',{name:'Pickup and drop-off'}).getByRole('button',{name:'Change'}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByRole('button',{name:'Choose a company stop instead'}).click();
 return dialog.getByRole('list',{name:'Available pickup stops'});
}
test('only the stops on the bus route are offered',async({page})=>{
 await passengerShowcase(page,{routeList:[otherRoute,coastalRoute]});
 await expect(page.getByRole('region',{name:'Pickup and drop-off'})).toContainText('Grand Anse');
 const list=await companyStops(page);
 await expect(list.getByRole('button')).toHaveCount(4);
 await expect(list).not.toContainText('Stop 5');
 await expect(list).not.toContainText('Other route');
 const grandAnse=list.getByRole('button',{name:/^Grand Anse/});
 await expect(grandAnse).toHaveAttribute('aria-pressed','true');
 await expect(grandAnse).toContainText('Coastal route');
});
test('a saved stop the bus does not make asks for one on its route',async({page})=>{
 await passengerShowcase(page,{routeList:[otherRoute,coastalRoute],pickup:'Stop 5'});
 const prompt=page.getByText("Your bus doesn't stop there");
 await expect(prompt).toBeVisible();
 await expect(page.getByText('TT-102 drives Coastal route, which doesn\'t stop at "Stop 5".',{exact:false})).toBeVisible();
 await expect(page.getByLabel('Your next bus').getByRole('status')).toHaveText('Choose your pickup');
 await page.getByRole('button',{name:'Choose a stop on its route'}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Choose a company stop instead'}).click();
 await expect(page.getByRole('dialog').getByRole('list',{name:'Available pickup stops'})).not.toContainText('Stop 5');
});
test('with no bus assigned, every route\'s stops are offered',async({page})=>{
 await passengerShowcase(page,{routeList:[otherRoute,coastalRoute],assigned:{current:false}});
 const list=await companyStops(page);
 await expect(list).toContainText('Stop 5');
 await expect(list).toContainText('True Blue');
});
test('stale location cannot claim the bus has arrived',async({page})=>{
 await passengerShowcase(page,{stale:true,busExtra:{current_lat:12.01,current_lng:-61.77,speed:0}});
 await expect(page.getByLabel('Your next bus').getByRole('status')).toHaveText('Location delayed');
});

// Every passenger screen and sheet at iPhone size: nothing spills sideways.
// With TT_SHOT_DIR set it also saves a picture of each one.
test.describe('phone tour',()=>{
 test.use({viewport:{width:390,height:844},deviceScaleFactor:2});
 // Dark (the approved look), light, and a chosen colour theme in each.
 const looks=[{look:'dark'},{look:'light',light:true},{look:'light-ocean',light:true,accent:'ocean'},{look:'dark-sunset',accent:'sunset'}];
 for(const {look,light=false,accent=null} of looks)test(`every passenger screen fits an iPhone (${look})`,async({page})=>{
  if(accent)await page.addInitScript(a=>localStorage.setItem('tt-accent',a),accent);
  await passengerShowcase(page,{pickup:'Morne Rouge',light});
  // The page really is light or dark, and the highlight follows the colour theme.
  const rgb=sel=>page.locator(sel).first().evaluate((el,prop)=>getComputedStyle(el)[prop],'backgroundColor');
  const lum=c=>{const [r,g,b]=c.match(/\d+/g).map(Number);return (r*299+g*587+b*114)/1000;};
  const pageBg=await page.locator('.tt-passenger-reference').evaluate(el=>getComputedStyle(el).backgroundColor);
  expect(lum(pageBg)>180).toBe(light);
  const button=await rgb('.px-find-btn');
  const cyanDark='rgb(24, 217, 237)',cyanLight='rgb(14, 116, 144)';
  if(accent)expect([cyanDark,cyanLight]).not.toContain(button);
  else expect(button).toBe(light?cyanLight:cyanDark);
  await page.route('**/functions/passengerAccount',r=>r.fulfill({json:{card:{issued:true,active:true,status:'Active'},history:[{id:'mine',vehicle_name:'TT-102',status:'boarded',boarded_at:'2026-10-11T10:00:00Z'}]}}));
  await page.route('**/functions/generateBoardingQr',r=>r.fulfill({json:{token:'TEST-QR'}}));
  const dir=process.env.TT_SHOT_DIR;
  const fits=async()=>expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  // Pictures are phone-screen sized: the top of each screen, then its end.
  const shot=async(name,whole=true)=>{
   await fits();
   if(!dir)return;
   const close=page.locator('[toast-close]').first();
   if(await close.isVisible().catch(()=>false)){await close.click().catch(()=>{});await close.waitFor({state:'hidden',timeout:3000}).catch(()=>{});}
   await page.evaluate(()=>window.scrollTo(0,0));
   await page.waitForTimeout(450);
   await page.screenshot({path:`${dir}/phone-${look==='dark'?'':look+'-'}${name}.png`});
   if(whole && await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight+40)){
    await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
    await page.waitForTimeout(300);
    await page.screenshot({path:`${dir}/phone-${look==='dark'?'':look+'-'}${name}-end.png`});
    await page.evaluate(()=>window.scrollTo(0,0));
   }
  };
  const sheet=async(name,open)=>{
   await open();
   await expect(page.getByRole('dialog')).toBeVisible();
   await page.waitForTimeout(500);
   await shot(name,false);
   await page.keyboard.press('Escape');
   await expect(page.getByRole('dialog')).toHaveCount(0);
  };
  await page.evaluate(()=>window.scrollTo(0,0));
  await shot('home');
  await sheet('pickup-sheet',()=>page.getByRole('region',{name:'Pickup and drop-off'}).getByRole('button',{name:'Change'}).click());
  await sheet('chat-sheet',()=>page.getByRole('button',{name:/^Need anything\? Message us/}).click());
  await tab(page,'Journey').click();
  await expect(page.getByRole('button',{name:'View live map',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'All route stops'}).click();
  await shot('journey');
  await tab(page,'My card').click();
  await expect(page.getByText('Issued · Active',{exact:true})).toBeVisible();
  await shot('card');
  await tab(page,'More').click();
  await expect(page.getByRole('heading',{name:'Your account'})).toBeVisible();
  await shot('more');
  await sheet('settings-sheet',()=>page.getByRole('button',{name:/^Notifications/}).click());
  await sheet('help-sheet',()=>page.getByRole('button',{name:/^Help & support/}).click());
  // Account → Appearance shows what the passenger actually sees: cyan until
  // they pick a colour.
  await page.getByRole('link',{name:/Edit profile/}).click();
  const themes=page.getByRole('radiogroup',{name:'Colour theme'});
  await expect(themes.getByRole('radio',{name:accent?new RegExp(accent,'i'):/Cyan/})).toHaveAttribute('aria-checked','true');
  await themes.scrollIntoViewIfNeeded();
  if(dir){await page.waitForTimeout(300);await page.screenshot({path:`${dir}/phone-${look==='dark'?'':look+'-'}appearance.png`});}
 });
});

// "Trust the phone" and the saved home (savedSignIn.js, passengerSnapshot.js).
// A sign-in token shaped like Base44's, so the saved profile can be tied to it.
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const signedIn=`${b64({alg:'none'})}.${b64({sub:'caller',exp:Math.floor(Date.now()/1000)+3600})}.sig`;
async function openedOnce(page){
 await passengerShowcase(page);
 await page.addInitScript(t=>localStorage.setItem('base44_access_token',t),signedIn);
 await page.reload();
 await expect(page.getByLabel('Your next bus',{exact:true})).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>!!localStorage.getItem('tt_saved_profile_v1'))).toBe(true);
}
test('a passenger who has opened the app before sees their home before the server answers',async({page})=>{
 await openedOnce(page);
 // Every server call now takes 4 seconds, like a weak mobile signal.
 await page.route('**/api/**',async r=>{await new Promise(f=>setTimeout(f,4000));return r.fallback();});
 const started=Date.now();
 await page.reload({waitUntil:'commit'});
 await expect(page.getByLabel('Your next bus',{exact:true})).toBeVisible({timeout:3000});
 expect(Date.now()-started).toBeLessThan(3000);
 await expect(page.getByRole('region',{name:'Pickup and drop-off'})).toContainText('Grand Anse');
});
test('a sign-in the server has ended goes back to sign-in and forgets the saved profile',async({page})=>{
 await openedOnce(page);
 await page.route('**/entities/User/me**',r=>r.fulfill({status:401,json:{message:'Authentication required'}}));
 await page.route('**/functions/entityAccess',r=>r.request().postDataJSON()?.entity==='User'?r.fulfill({status:401,json:{error:'Authentication required'}}):r.fallback());
 await page.reload();
 await expect(page).toHaveURL(/\/login/);
 expect(await page.evaluate(()=>localStorage.getItem('tt_saved_profile_v1'))).toBeNull();
});
