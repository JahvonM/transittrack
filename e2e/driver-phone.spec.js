import {test,expect} from '@playwright/test';

// The driver phone app at phone size, with every backend call mocked.
const SHOTS=process.env.TT_SHOT_DIR||'';
const shot=async(page,name)=>{ if(SHOTS) await page.screenshot({path:`${SHOTS}/${name}.png`}); };
test.use({viewport:{width:412,height:915},deviceScaleFactor:2,isMobile:true,hasTouch:true});

const TODAY={
 buses:[{id:'bus-a',name:'Bus 12',plate_number:'HA 1234',fleet_number:'12'}],
 bus:{id:'bus-a',name:'Bus 12',plate_number:'HA 1234',fleet_number:'12'},
 route:{id:'route-a',name:'Grand Anse morning',stops:[{name:'Town',order:0,lat:12.05,lng:-61.75},{name:'True Blue',order:1,lat:12.02,lng:-61.76},{name:'Grand Anse',order:2,lat:12.0,lng:-61.78}]},
 pickups:[{name:'Jane R.',stop:'Town',skipping:false,late:false},{name:'Marcus T.',stop:'Town',skipping:false,late:true},{name:'Keisha B.',stop:'True Blue',skipping:false,late:false},{name:'Sam',stop:'',skipping:true,late:false}],
 shift:null,
 last_shift:{started_at:'2026-10-06T10:40:00Z',ended_at:'2026-10-06T18:15:00Z'},
 notices:[{id:'n1',title:'Road works',message:'Use the bypass at Morne Rouge until Friday.',created_date:'2026-10-07T07:00:00Z'}],
 contacts:{dispatch_phone:'+1 473 555 0100',manager_phone:'+1 473 555 0199'},
 workplace:{name:'Coyaba Resort'},
};
const ME={driver:{name:'Dana Driver',email:'dana.driver@gmail.com',phone:'+1 473 555 0123'},company:{id:'a',name:'Coyaba Transport'},buses:[TODAY.bus]};
const MESSAGES=[
 {id:'g1',channel:'dispatch',sender_role:'admin',sender_name:'Dispatch',text:'Morning Dana, Bus 12 is fuelled and ready.',created_date:'2026-10-07T10:02:00Z',mine:false},
 {id:'g2',channel:'dispatch',sender_role:'driver',sender_name:'Dana Driver',text:'Thanks, heading out at 6:45.',created_date:'2026-10-07T10:05:00Z',mine:true},
];
const in20days=new Date(Date.now()+20*86400e3).toISOString().slice(0,10);

async function phone(page,{refuse=false,today=TODAY,user={id:'u1',email:'dana.driver@gmail.com',full_name:'Dana Driver',role:'user'}}={}) {
 const calls=[];
 await page.addInitScript(()=>{ localStorage.setItem('base44_access_token','mock-authenticated-session'); });
 await page.route('https://api.mapbox.com/**',r=>r.fulfill({status:404,body:''}));
 await page.route('**/api/**',async route=>{
  const url=route.request().url();
  if(url.includes('/functions/driverPhone')) {
   const body=route.request().postDataJSON();calls.push(body);
   if(refuse) return route.fulfill({status:403,json:{error:'Ask your administrator to put this email on your driver record and switch on "Can use the phone app".',code:'NOT_A_DRIVER'}});
   const reply={me:ME,today,messages:{messages:MESSAGES},documents:{documents:[
     {id:'d1',kind:'license',document_number:'GD-55821',expiry_date:in20days,file_name:'licence.jpg',url:'https://files.test/licence.jpg'},
     {id:'d2',kind:'insurance',document_number:'',expiry_date:'2027-08-31',file_name:'insurance.pdf',url:'https://files.test/ins.pdf'}]},
    send:{message:{id:'g3',channel:body.channel,sender_role:'driver',sender_name:'Dana Driver',text:body.text,created_date:new Date().toISOString(),mine:true}},
    report:{ok:true,incident:{id:'inc1',type:body.type,photos:(body.photos||[]).length}},register_push:{ok:true}}[body.action];
   return route.fulfill({json:reply||{error:'Unknown action'}});
  }
  if(url.includes('/functions/companyAccess')) return route.fulfill({status:401,json:{error:'Company code required',code:'COMPANY_ACCESS_REQUIRED'}});
  if(url.includes('/functions/entityAccess')) {
   const body=route.request().postDataJSON();
   if(body.entity==='User' && body.operation==='get') return route.fulfill({json:{result:user}});
   return route.fulfill({json:{result:[]}});
  }
  if(url.includes('/entities/User/me')) return route.fulfill({json:user});
  return route.fulfill({json:{id:'test-app',public_settings:{authentication_required:false}}});
 });
 return calls;
}

test('a driver signing in lands on Today with the bus, stops and pickups',async({page})=>{
 await phone(page);
 await page.goto('/staff');
 await expect(page).toHaveURL(/\/driver-phone$/);
 await expect(page.getByRole('heading',{name:/Dana$/})).toBeVisible();
 await expect(page.getByText('Bus 12',{exact:true})).toBeVisible();
 await expect(page.getByText('Not on shift',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Start shift'})).toBeVisible();
 await expect(page.getByText('Pick up Jane R., Marcus T. (running late)')).toBeVisible();
 await expect(page.getByText('Not riding today: Sam')).toBeVisible();
 await expect(page.getByRole('link',{name:'Call'}).first()).toHaveAttribute('href','tel:+14735550100');
 await shot(page,'01-today');
 await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
 await shot(page,'02-today-stops');
});

test('messages from dispatch show and the driver can reply',async({page})=>{
 const calls=await phone(page);
 await page.goto('/driver-phone/messages');
 await expect(page.getByText('Morning Dana, Bus 12 is fuelled and ready.')).toBeVisible();
 await page.getByLabel('Message',{exact:true}).fill('Flat tyre at True Blue, waiting for help');
 await page.getByRole('button',{name:'Send message'}).click();
 await expect(page.getByText('Flat tyre at True Blue, waiting for help')).toBeVisible();
 expect(calls.find(c=>c.action==='send')).toMatchObject({channel:'dispatch',vehicle_id:'bus-a',text:'Flat tyre at True Blue, waiting for help'});
 await shot(page,'03-messages');
});

test('a problem report goes out with its photo',async({page})=>{
 const calls=await phone(page);
 await page.goto('/driver-phone/report');
 await page.getByRole('button',{name:'Breakdown'}).click();
 await page.getByLabel('Details').fill('Engine light on, pulled over at Morne Rouge.');
 // A real 1x1 PNG, shrunk to JPEG on the phone before sending.
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
 await page.locator('input[type=file]').setInputFiles({name:'engine.png',mimeType:'image/png',buffer:png});
 await expect(page.getByRole('img',{name:'Photo 1'})).toBeVisible();
 await shot(page,'04-report');
 await page.getByRole('button',{name:'Send report'}).click();
 await expect(page.getByRole('heading',{name:'Report sent to dispatch'})).toBeVisible();
 const sent=calls.find(c=>c.action==='report');
 expect(sent).toMatchObject({type:'breakdown',details:'Engine light on, pulled over at Morne Rouge.',vehicle_id:'bus-a'});
 expect(sent.photos).toHaveLength(1);
 expect(sent.photos[0].mime_type).toBe('image/jpeg');
 expect(sent.photos[0]).not.toHaveProperty('preview');
 await shot(page,'05-report-sent');
});

test('Me shows documents with their expiry',async({page})=>{
 await phone(page);
 await page.goto('/driver-phone/me');
 await expect(page.getByText(/^Expires in 2\d days/)).toBeVisible();
 await expect(page.getByText(/^Valid until/)).toBeVisible();
 await expect(page.getByRole('button',{name:'Turn on notifications'})).toBeVisible();
 await shot(page,'06-me');
});

test('an account that is not a driver is refused with a way out',async({page})=>{
 await phone(page,{refuse:true});
 await page.goto('/driver-phone');
 await expect(page.getByRole('heading',{name:"This account isn't set up for the driver app"})).toBeVisible();
 await expect(page.getByText('dana.driver@gmail.com')).toBeVisible();
 await expect(page.getByRole('button',{name:/Sign out/})).toBeVisible();
 await shot(page,'07-refused');
});

test('a passenger with no company still gets the company code screen',async({page})=>{
 await phone(page,{refuse:true});
 await page.goto('/staff');
 await expect(page).toHaveURL(/\/staff$/);
 await expect(page.getByText('Enter your company code')).toBeVisible();
});

test('while the bus moves the app shows only the Driving screen and sends no location',async({page})=>{
 await page.addInitScript(()=>{
  let speed=0;
  window.__setSpeed=v=>{speed=v;};
  navigator.geolocation.watchPosition=(ok)=>{ const id=setInterval(()=>ok({coords:{latitude:12.01,longitude:-61.76,speed,accuracy:5},timestamp:Date.now()}),200); return id; };
  navigator.geolocation.clearWatch=id=>clearInterval(id);
 });
 const calls=await phone(page,{today:{...TODAY,shift:{mine:true,started_at:new Date(Date.now()-3600e3).toISOString()}}});
 await page.goto('/driver-phone');
 await expect(page.getByText(/^On shift since/)).toBeVisible();
 await page.evaluate(()=>window.__setSpeed(12));
 await expect(page.getByRole('alertdialog')).toBeVisible();
 await expect(page.getByRole('heading',{name:'Driving'})).toBeVisible();
 await shot(page,'08-driving');
 await page.evaluate(()=>window.__setSpeed(0));
 await expect(page.getByRole('alertdialog')).toBeHidden({timeout:15000});
 expect(JSON.stringify(calls)).not.toMatch(/latitude|longitude|-61\.76|"lat"|"lng"/);
});

test('admin switches the phone app on for a driver',async({page})=>{
 const saves=[];
 await page.addInitScript(()=>{ localStorage.setItem('base44_access_token','mock-authenticated-session'); });
 await page.route('https://api.mapbox.com/**',r=>r.fulfill({status:404,body:''}));
 const driver={id:'drv',full_name:'Dana Driver',email:'dana.driver@gmail.com',phone:'+1 473 555 0123',company_id:'a',company_name:'Coyaba Transport',phone_app_access:false};
 await page.route('**/api/**',async route=>{
  const url=route.request().url();
  if(url.includes('/functions/entityAccess')) {
   const body=route.request().postDataJSON();let result=[];
   if(body.entity==='User' && body.operation==='get') result={id:'admin',email:'admin@test.local',full_name:'Admin',role:'admin'};
   else if(body.entity==='Driver' && body.operation==='update'){saves.push(body.data);Object.assign(driver,body.data);result=driver;}
   else if(body.entity==='Driver') result=[driver];
   else if(body.entity==='Company') result=[{id:'a',name:'Coyaba Transport'}];
   else if(body.entity==='Vehicle') result=[{id:'bus-a',name:'Bus 12',company_id:'a',driver_email:'dana.driver@gmail.com',driver_name:'Dana Driver',status:'idle'}];
   return route.fulfill({json:{result}});
  }
  if(url.includes('/entities/User/me')) return route.fulfill({json:{id:'admin',role:'admin',email:'admin@test.local'}});
  return route.fulfill({json:{id:'test-app',public_settings:{authentication_required:false}}});
 });
 await page.setViewportSize({width:1280,height:900});
 await page.goto('/admin/drivers');
 await page.getByRole('button',{name:'Edit Dana Driver'}).click();
 const toggle=page.getByRole('switch',{name:'Can use the phone app'});
 await expect(toggle).not.toBeChecked();
 await toggle.click();
 await shot(page,'09-admin-switch');
 await page.getByRole('button',{name:'Save changes'}).click();
 await expect.poll(()=>saves.length).toBe(1);
 expect(saves[0]).toMatchObject({email:'dana.driver@gmail.com',phone_app_access:true});
 await expect(page.getByText('Phone app',{exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'WhatsApp'})).toHaveAttribute('href','https://wa.me/14735550123');
});

test('phone loading follows real requests, displays bus artwork, and respects reduced motion',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await phone(page,{today:{...TODAY,bus:{...TODAY.bus,image_url:'/images/transit-bus-3d.webp'}}});
 let release;const pending=new Promise(resolve=>{release=resolve});
 await page.route('**/functions/driverPhone',async r=>{
  if(r.request().postDataJSON().action==='messages')await pending;
  return r.fallback();
 });
 await page.goto('/driver-phone');
 const loading=page.getByRole('region',{name:'TransitTrack loading screen'});
 await expect(loading).toBeVisible();
 await expect(loading.getByText('Coyaba Transport',{exact:true})).toBeVisible();
 await expect(loading.getByRole('status')).toHaveText('Loading your bus and pickups…');
 await expect(loading.locator('.tt-loading-bus')).toHaveAttribute('src','/images/transit-bus-3d.webp');
 expect(await loading.locator('.tt-loading-progress span').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const bus=await loading.locator('.tt-loading-bus').boundingBox();
 const title=await loading.getByRole('heading').boundingBox();
 expect(bus.y+bus.height).toBeLessThanOrEqual(title.y);
 await page.screenshot({path:'/tmp/tt-loading-phone.png'});
 release();
 await expect(loading).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Start shift',exact:true})).toBeVisible();
});
