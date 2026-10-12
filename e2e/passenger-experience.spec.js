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
test('stale location cannot claim the bus has arrived',async({page})=>{
 await passengerShowcase(page,{stale:true,busExtra:{current_lat:12.01,current_lng:-61.77,speed:0}});
 await expect(page.getByLabel('Your next bus').getByRole('status')).toHaveText('Location delayed');
});
