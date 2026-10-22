import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const vehicle = { id: 'bus-a', name: 'Bus A', company_id: 'company-a', capacity: 25, status: 'idle' };
const kiosk = { device_id: 'kiosk-test', paired: true, kiosk_type: 'bus_boarding', company_id: 'company-a', company_name: 'Company A', vehicle_id: 'bus-a', vehicle_name: 'Bus A', context: { vehicle, route: null, occupancy: 7, today_count: 12, ads: [] } };
const driver = { vehicle, driver_name: 'Test Driver', has_driver_pin: true, occupancy: 7, staff: [], check_ins: [], broadcasts: [], group_messages: [], trips: [], inspection_templates: [], recent_inspections: [], open_shift: null, emergency_contacts: { boss_phone: '5551234', secretary_phone: '' } };

async function mockApi(page, calls, driverContext=driver) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = request.url();
    calls.push(url);
    const body = request.postDataJSON();
    if (url.includes('/functions/kioskHeartbeat')) return route.fulfill({ json: kiosk });
    if (url.includes('/functions/kioskCheckIn')) return route.fulfill({ json: { staff: [], generated_at: new Date().toISOString() } });
    if (url.includes('/functions/driverSession')) {
      if (body?.action === 'my_documents') return route.fulfill(body.pin === '1234'
        ? { json: { ok: true, driver_name: 'Test Driver', documents: [
          { kind: 'license', document_number: 'DL-1', expiry_date: '2030-01-31', file_name: 'licence.png', url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' },
          { kind: 'insurance', document_number: 'INS-9', expiry_date: '2020-01-31', file_name: 'cover.pdf', url: 'https://files.test/cover.pdf' }] } }
        : { status: 403, json: { error: 'Incorrect PIN' } });
      if (body?.action === 'verify_pin') return route.fulfill(body.pin === '1234' ? { json: { ok: true, driver_grant: "a".repeat(64) } } : { status: 403, json: { error: 'Incorrect PIN' } });
      return route.fulfill({ json: driverContext });
    }
    if (url.includes('/functions/appSupport')) return route.fulfill({ json: { whatsapp_number: '14735551234' } });
    if (url.includes('/entities/')) return route.fulfill({ status: 403, json: { error: 'Direct entity access blocked in test' } });
    return route.fulfill({ json: { id: 'test-app', public_settings: { authentication_required: false } } });
  });
}


async function openDriver(page,extra={}) {
 const context={...driver,company_name:'Real Company',...extra};
 await mockApi(page,[],context);
 await page.addInitScript(()=>{
  localStorage.setItem('tt_driver_device_id','driver-test');
  localStorage.setItem('tt-map-engine','basic');
  window.__watchCount=0;window.__clearCount=0;
  navigator.geolocation.watchPosition=()=>{window.__watchCount++;return window.__watchCount;};
  navigator.geolocation.clearWatch=()=>window.__clearCount++;
 });
 await page.route('https://api.mapbox.com/**',r=>r.fulfill({status:404,body:''}));
 await page.goto('/driver/track');
 await page.locator('input[type=password]').fill('1234');
 await page.getByRole('button',{name:'Unlock',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Your journey'})).toBeVisible();
 return context;
}
const sections=page=>page.getByRole('navigation',{name:'Driver sections'});
const route={id:'coast',name:'Coastal route',company_id:'company-a',path:[{lat:12.105,lng:-61.747},{lat:12.09,lng:-61.75},{lat:12.075,lng:-61.755}],stops:[{name:'Grand Roy',lat:12.105,lng:-61.747,order:0},{name:'Palmiste',lat:12.09,lng:-61.75,order:1},{name:'Concord',lat:12.075,lng:-61.755,order:2}]};
for(const size of [{width:1280,height:800},{width:1024,height:600}])test('approved landscape layout fits '+size.width,async({page})=>{
 await page.setViewportSize(size);
 await openDriver(page,{route,company_name:"McSween's Transport",vehicle:{...vehicle,name:'Bus 12',current_lat:12.095,current_lng:-61.749,last_location_update:new Date().toISOString()}});
 await expect(page.getByTestId('landscape-journey')).toBeVisible();
 await expect(sections(page).getByRole('button')).toHaveCount(5);
 await expect(page.getByRole('region',{name:'Next stop',exact:true})).toContainText('Grand Roy');
 const map=await page.locator('.dl-map-stage').boundingBox(),panel=await page.locator('.dl-trip-panel').boundingBox();
 expect(map.width).toBeGreaterThan(size.width*.55);expect(panel.x).toBeGreaterThan(map.x+map.width-1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'/tmp/tt-driver-fit-'+size.width+'.png'});
 expect(await page.locator('.dl-panel-scroll').evaluate(e=>e.scrollHeight<=e.clientHeight+1)).toBe(true);
 for(const element of [page.getByRole('button',{name:'Navigate',exact:true}),page.getByRole('button',{name:'Change stop',exact:true}),page.getByRole('button',{name:'Start tracking',exact:true}),page.getByRole('button',{name:'Start shift',exact:true}),page.getByRole('button',{name:/^SOS/}),sections(page)]) {
  await expect(element).toBeVisible();const box=await element.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(size.height+1);expect(box.height).toBeGreaterThanOrEqual(44);
 }
 await page.screenshot({path:'/tmp/tt-driver-landscape-'+size.width+'.png'});
});
test('stop choice updates next stop and navigation still opens',async({page})=>{
 await page.setViewportSize({width:1280,height:800});await openDriver(page,{route});
 await page.getByRole('button',{name:'Change stop',exact:true}).click();
 await page.getByRole('dialog',{name:'Choose next stop'}).getByRole('button',{name:'Palmiste',exact:true}).click();
 await page.getByRole('button',{name:'Make this my next stop',exact:true}).click();
 const next=page.getByRole('region',{name:'Next stop',exact:true});await expect(next).toContainText('Palmiste');await expect(next).toContainText('Stop 2 of 3');
 await page.getByRole('button',{name:'Navigate',exact:true}).click();
 await expect(page.getByLabel('Driver navigation map')).toBeVisible();
 await expect(page.locator('.dl-trip-panel')).toBeVisible();
 const inline=await page.getByLabel('Driver navigation map',{exact:true}).boundingBox(),stage=await page.locator('.dl-map-stage').boundingBox();
 expect(inline.x).toBeGreaterThanOrEqual(stage.x);expect(inline.x+inline.width).toBeLessThanOrEqual(stage.x+stage.width+1);
 await expect(page.getByRole('button',{name:'Zoom in',exact:true})).toBeVisible();
 await page.screenshot({path:'/tmp/tt-inline-driver-nav.png'});

 await page.getByRole('button',{name:'Street',exact:true}).click();
 await expect(page.getByRole('button',{name:'Street',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Satellite',exact:true}).click();
 await expect(page.getByRole('button',{name:'Satellite',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Back to journey'}).click();
 await expect(next).toContainText('Palmiste');
});
test('bottom navigation and rotation preserve one GPS watcher',async({page})=>{
 await page.setViewportSize({width:1280,height:800});
 await openDriver(page,{route,vehicle:{...vehicle,tracking_active:true},staff:[{id:'p',full_name:'Real Passenger'}],open_shift:{id:'shift',started_at:new Date().toISOString()}});
 await expect.poll(()=>page.evaluate(()=>window.__watchCount)).toBe(1);
 const nav=sections(page);
 for(const [button,heading] of [['Bus stops','Bus stops'],['Passengers','Passengers'],['Messages','Messages'],['More','More']]){
  await nav.getByRole('button',{name:button,exact:true}).click();
  await expect(nav.getByRole('button',{name:button,exact:true})).toHaveAttribute('aria-current','page');
 }
 await nav.getByRole('button',{name:'Drive',exact:true}).click();
 await page.setViewportSize({width:800,height:1280});
 await expect(nav.getByRole('button')).toHaveCount(3);await expect(page.getByTestId('landscape-journey')).toHaveCount(0);
 await page.setViewportSize({width:1280,height:800});
 await expect(page.getByTestId('landscape-journey')).toBeVisible();await expect(nav.getByRole('button')).toHaveCount(5);
 expect(await page.evaluate(()=>window.__watchCount)).toBe(1);expect(await page.evaluate(()=>window.__clearCount)).toBe(0);
});
test('SOS retains hold activation and uses the authenticated session',async({page})=>{
 await page.setViewportSize({width:1280,height:800});await openDriver(page,{route});
 const sent=[];await page.route('**/functions/driverSession',r=>{const b=r.request().postDataJSON();if(b.action==='sos'){sent.push(b);return r.fulfill({json:{ok:true}});}return r.fallback();});
 const sos=page.getByRole('button',{name:/^SOS/});await sos.click();expect(sent).toHaveLength(0);
 const box=await sos.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
 await expect.poll(()=>sent.length).toBe(1);await page.mouse.up();
 expect(sent[0]).toMatchObject({action:'sos',device_id:'driver-test'});
});

test('background GPS is opt-in, bound to this bus and can export saved points',async({page})=>{
 await page.setViewportSize({width:1280,height:800});
 await page.addInitScript(()=>{
  localStorage.setItem('tt_device_token_driver-test','c'.repeat(64));
  const state={available:true,enabled:false,active:false,pending:1,review:1,status:'Background tracking is off'};
  const listeners=new Map();window.__backgroundConfigs=[];window.__backgroundStops=0;
  const gps={getState:async()=>({available:true,enabled:false,backgroundManaged:state.active,status:state.active?'Fix (tablet background GPS)':'Off'}),addListener:async(name,cb)=>{listeners.set(name,cb);return {remove:async()=>listeners.delete(name)}}};
  const background={getState:async()=>({...state}),setEnabled:async({enabled})=>{state.enabled=enabled;if(!enabled){state.active=false;window.__backgroundStops++;}return {...state}},
   configure:async data=>{window.__backgroundConfigs.push(data);state.active=true;state.status='Fix (tablet background GPS)';listeners.get('gpsState')?.(await gps.getState());return {managed:true}},
   pulse:async()=>({}),stop:async()=>{window.__backgroundStops++;state.active=false;listeners.get('gpsState')?.({available:true,enabled:false,backgroundManaged:false,status:'Off'});},
   savedPoints:async()=>({points:[{queue_id:'saved-one',expected_vehicle_id:'bus-a',lat:12,lng:-61,state:'needs_review'}],cursor:1,max:1,done:true})};
  const other=new Proxy({},{get:(_,key)=>key==='addListener'?async()=>({remove:async()=>{}}):async()=>({})});
  window.CapacitorPlatforms={platforms:new Map(),currentPlatform:{name:'android',getPlatform:()=> 'android',isNativePlatform:()=>true,isPluginAvailable:name=>['UsbGps','DriverBackground'].includes(name),registerPlugin:name=>name==='DriverBackground'?background:name==='UsbGps'?gps:other}};
 });
 await openDriver(page,{vehicle:{...vehicle,tracking_active:true}});
 expect(await page.evaluate(()=>window.__backgroundConfigs.length)).toBe(0);
 await sections(page).getByRole('button',{name:'More',exact:true}).click();
 await page.getByRole('button',{name:/Test Driver.*Tablet settings/}).click();
 const toggle=page.getByRole('switch',{name:'Keep driver GPS in background'});
 await expect(toggle).not.toBeChecked();await toggle.click();
 await expect.poll(()=>page.evaluate(()=>window.__backgroundConfigs.length)).toBeGreaterThan(0);
 expect(await page.evaluate(()=>window.__backgroundConfigs[0])).toMatchObject({device_id:'driver-test',expected_company_id:'company-a',expected_vehicle_id:'bus-a'});
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export saved GPS',exact:true}).click();expect((await download).suggestedFilename()).toBe('saved-driver-gps.json');
 await toggle.click();await expect.poll(()=>page.evaluate(()=>window.__backgroundStops)).toBeGreaterThan(0);
});

// Every driver tablet screen, landscape and portrait: nothing spills sideways
// and the main controls stay on screen. With TT_SHOT_DIR set it also saves a
// picture of each one.
for(const [orient,size,tabs] of [['landscape',{width:1280,height:800},['Drive','Bus stops','Passengers','Messages','More']],['portrait',{width:800,height:1280},['Drive','Passengers','More']]])test(`tablet tour (${orient})`,async({page})=>{
 await page.setViewportSize(size);
 const now=new Date().toISOString();
 await openDriver(page,{route,company_name:"McSween's Transport",occupancy:3,
  vehicle:{...vehicle,name:'Bus 12',current_lat:12.095,current_lng:-61.749,last_location_update:now},
  open_shift:{id:'shift',started_at:now},
  staff:[{id:'a',full_name:'Alice Joseph',favorite_stop:'Grand Roy'},{id:'b',full_name:'Ben Charles',favorite_stop:'Palmiste'},{id:'c',full_name:'Cara Mitchell',favorite_stop:'Concord'}],
  check_ins:[{id:'t1',staff_id:'a',staff_name:'Alice Joseph',status:'boarded',boarded_at:now,check_in_method:'nfc'}]});
 const dir=process.env.TT_SHOT_DIR;
 const fits=async()=>expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const shot=async name=>{await fits();if(dir){await page.waitForTimeout(400);await page.screenshot({path:`${dir}/tablet-${orient}-${name}.png`});}};
 for(const tab of tabs){
  await sections(page).getByRole('button',{name:tab,exact:true}).click();
  await page.waitForTimeout(300);
  await shot(tab.toLowerCase().replace(/ /g,'-'));
 }
 await sections(page).getByRole('button',{name:'Drive',exact:true}).click();
 await page.getByRole('button',{name:'Change stop',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Choose next stop'})).toBeVisible();
 await shot('change-stop');
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Choose next stop'})).toHaveCount(0);
});

// The tablet keeps its last trip screen and opens from it while the server
// catches up (useDriverSession's saved copy; the PIN is asked once a day).
test('the tablet reopens its trip screen before the server answers',async({page})=>{
 await page.setViewportSize({width:1280,height:800});
 await openDriver(page,{route,vehicle:{...vehicle,name:'Bus 12'}});
 await expect(page.getByRole('region',{name:'Next stop',exact:true})).toContainText('Grand Roy');
 // Every server call now takes 4 seconds, like a weak mobile signal.
 await page.route('**/api/**',async r=>{await new Promise(f=>setTimeout(f,4000));return r.fallback();});
 const started=Date.now();
 await page.reload({waitUntil:'commit'});
 await expect(page.getByRole('region',{name:'Next stop',exact:true})).toContainText('Grand Roy',{timeout:3000});
 expect(Date.now()-started).toBeLessThan(3000);
});
