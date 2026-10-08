import {test,expect} from '@playwright/test';

// Step 3: day-off and swap requests (phone and admin), and backup GPS from
// the driver's phone (phone and Live fleet).
const SHOTS=process.env.TT_SHOT_DIR||'';
const shot=async(page,name)=>{ if(SHOTS) await page.screenshot({path:`${SHOTS}/${name}.png`}); };
const iso=(days)=>{const d=new Date(Date.now()+days*86400e3);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);};

const BUS={id:'bus-a',name:'Bus 12',plate_number:'HA 1234',fleet_number:'12'};
const TODAY={buses:[BUS],bus:BUS,route:{id:'r',name:'Grand Anse morning',stops:[{name:'Town',order:0},{name:'Grand Anse',order:1}]},
 pickups:[],shift:null,last_shift:null,notices:[],contacts:null,workplace:null,walkaround:null};
const ME={driver:{name:'Dana Driver',email:'dana.driver@gmail.com',phone:''},company:{id:'a',name:'Coyaba Transport'},buses:[BUS]};

async function phone(page,{today=TODAY,requests=[]}={}) {
 const calls=[];const state={requests:[...requests]};
 await page.addInitScript(()=>{ localStorage.setItem('base44_access_token','mock-authenticated-session'); });
 await page.route('https://api.mapbox.com/**',r=>r.fulfill({status:404,body:''}));
 await page.route('**/api/**',async route=>{
  const url=route.request().url();
  if(url.includes('/functions/driverPhone')) {
   const body=route.request().postDataJSON();calls.push(body);
   if(body.action==='requests') return route.fulfill({json:{requests:state.requests,colleagues:[{id:'d2',name:'Sam Other'}]}});
   if(body.action==='request') {
    const r={id:'r'+(state.requests.length+1),kind:body.kind,start_date:body.start_date,end_date:body.end_date,swap_with_name:body.swap_with_driver_id?'Sam Other':'',note:body.note,status:'pending'};
    state.requests=[r,...state.requests];return route.fulfill({json:{ok:true,request:r}});
   }
   if(body.action==='cancel_request') { state.requests=state.requests.map(r=>r.id===body.request_id?{...r,status:'cancelled'}:r); return route.fulfill({json:{ok:true}}); }
   if(body.action==='backup_location') return route.fulfill({json:{ok:true,driving_event:null}});
   const reply={me:ME,today,messages:{messages:[]},documents:{documents:[]},hours:{shifts:[]},register_push:{ok:true}}[body.action];
   return route.fulfill({json:reply||{error:'Unknown action'}});
  }
  if(url.includes('/functions/entityAccess')) {
   const body=route.request().postDataJSON();
   if(body.entity==='User' && body.operation==='get') return route.fulfill({json:{result:{id:'u1',email:'dana.driver@gmail.com',full_name:'Dana Driver',role:'user'}}});
   return route.fulfill({json:{result:[]}});
  }
  if(url.includes('/entities/User/me')) return route.fulfill({json:{id:'u1',email:'dana.driver@gmail.com',role:'user'}});
  return route.fulfill({json:{id:'test-app',public_settings:{authentication_required:false}}});
 });
 return calls;
}

test.describe('phone',()=>{
 test.use({viewport:{width:412,height:915},deviceScaleFactor:2,isMobile:true,hasTouch:true});

 test('asks for days off and a swap, and cancels one',async({page})=>{
  const calls=await phone(page,{requests:[{id:'old',kind:'day_off',start_date:iso(-20),end_date:iso(-20),status:'approved',decision_note:'Enjoy'}]});
  await page.goto('/driver-phone/me');
  await page.getByRole('button',{name:/Days off and swaps/}).click();
  await expect(page.getByRole('heading',{name:'Days off and swaps'})).toBeVisible();
  await expect(page.getByText('Approved: Enjoy')).toBeVisible();
  await page.getByLabel('First day').fill(iso(5));
  await page.getByLabel(/Last day/).fill(iso(6));
  await page.getByLabel(/Note/).fill('Family wedding');
  await shot(page,'s3-01-request-form');
  await page.getByRole('button',{name:'Send request'}).click();
  await expect(page.getByText("Sent. You'll get a notification when it's answered.")).toBeVisible();
  expect(calls.find(c=>c.action==='request')).toMatchObject({kind:'day_off',start_date:iso(5),end_date:iso(6),note:'Family wedding'});
  await page.getByRole('tab',{name:/Swap a shift/}).click();
  await page.getByLabel('Day',{exact:true}).fill(iso(9));
  await page.getByRole('button',{name:'Send request'}).click();
  await expect(page.getByRole('alert')).toContainText('Choose who to swap with');
  await page.getByLabel('Swap with').selectOption({label:'Sam Other'});
  await page.getByRole('button',{name:'Send request'}).click();
  await expect(page.getByText(/^Swap .* with Sam Other$/)).toBeVisible();
  await page.getByRole('button',{name:'Cancel'}).first().click();
  await expect(page.getByText('Cancelled').first()).toBeVisible();
  await shot(page,'s3-02-requests');
 });

 test('backup GPS sends the position only while it is on, and says so',async({page,context})=>{
  await context.grantPermissions(['geolocation']);
  await page.addInitScript(()=>{
   navigator.geolocation.watchPosition=(ok)=>{ const id=setInterval(()=>ok({coords:{latitude:12.0501,longitude:-61.7501,speed:4,accuracy:5},timestamp:Date.now()}),300); return id; };
   navigator.geolocation.clearWatch=id=>clearInterval(id);
  });
  const calls=await phone(page,{today:{...TODAY,backup_gps:true,shift:{id:'s1',mine:true,started_with:'phone',started_at:new Date(Date.now()-3600e3).toISOString()}}});
  await page.goto('/driver-phone');
  await expect(page.getByRole('status',{name:'Backup GPS'})).toContainText('Backup GPS is on');
  await expect(page.getByText(/Last sent/)).toBeVisible({timeout:10000});
  await shot(page,'s3-03-backup-gps');
  const sent=calls.filter(c=>c.action==='backup_location');
  expect(sent[0]).toMatchObject({vehicle_id:'bus-a',lat:12.0501,lng:-61.7501,speed:4});
 });

 test('with backup GPS off the phone never sends a position',async({page,context})=>{
  await context.grantPermissions(['geolocation']);
  await page.addInitScript(()=>{
   navigator.geolocation.watchPosition=(ok)=>{ const id=setInterval(()=>ok({coords:{latitude:12.05,longitude:-61.75,speed:0,accuracy:5},timestamp:Date.now()}),300); return id; };
   navigator.geolocation.clearWatch=id=>clearInterval(id);
  });
  const calls=await phone(page,{today:{...TODAY,shift:{id:'s1',mine:true,started_at:new Date().toISOString()}}});
  await page.goto('/driver-phone');
  await expect(page.getByText(/^On shift since/)).toBeVisible();
  await page.waitForTimeout(6000);
  expect(calls.some(c=>c.action==='backup_location')).toBe(false);
  expect(JSON.stringify(calls)).not.toMatch(/-61\.75|"lat"/);
 });
});

test.describe('admin',()=>{
 test.use({viewport:{width:1280,height:900}});
 async function admin(page,{vehicles=[],requests=[]}={}) {
  const updates=[],decisions=[];
  await page.addInitScript(()=>{ localStorage.setItem('base44_access_token','mock-authenticated-session'); localStorage.setItem('tt-map-engine','basic'); });
  await page.route('https://api.mapbox.com/**',r=>r.fulfill({status:404,body:''}));
  await page.route('**/api/**',async route=>{
   const url=route.request().url();
   if(url.includes('/functions/driverRequests')) {
    const body=route.request().postDataJSON();
    if(body.action==='decide'){ decisions.push(body); requests=requests.map(r=>r.id===body.request_id?{...r,status:body.decision,decision_note:body.note}:r); }
    return route.fulfill({json:{requests}});
   }
   if(url.includes('/functions/entityAccess')) {
    const body=route.request().postDataJSON();let result=[];
    if(body.entity==='User' && body.operation==='get') result={id:'admin',email:'admin@test.local',full_name:'Admin',role:'admin'};
    else if(body.entity==='Vehicle' && body.operation==='update'){updates.push(body.data);const v=vehicles.find(x=>x.id===body.id);Object.assign(v,body.data);result=v;}
    else if(body.entity==='Vehicle') result=vehicles;
    else if(body.entity==='Driver') result=[{id:'drv',full_name:'Dana Driver',email:'dana.driver@gmail.com',company_id:'a',phone_app_access:true}];
    else if(body.entity==='Company') result=[{id:'a',name:'Coyaba Transport'}];
    return route.fulfill({json:{result}});
   }
   if(url.includes('/entities/User/me')) return route.fulfill({json:{id:'admin',role:'admin',email:'admin@test.local'}});
   return route.fulfill({json:{id:'test-app',public_settings:{authentication_required:false}}});
  });
  return {updates,decisions};
 }

 test('approves a day-off request with a reply',async({page})=>{
  const {decisions}=await admin(page,{requests:[
   {id:'r1',company_id:'a',company_name:'Coyaba Transport',driver_name:'Dana Driver',kind:'day_off',start_date:iso(5),end_date:iso(6),note:'Family wedding',status:'pending'},
   {id:'r2',company_id:'a',company_name:'Coyaba Transport',driver_name:'Sam Other',kind:'swap',start_date:iso(9),end_date:iso(9),swap_with_name:'Dana Driver',status:'pending'}]});
  await page.goto('/admin/drivers');
  await expect(page.getByRole('heading',{name:'Day-off and swap requests'})).toBeVisible();
  await expect(page.getByText('2 waiting')).toBeVisible();
  await page.getByLabel('Reply to Dana Driver (optional)').fill('Enjoy the wedding');
  await shot(page,'s3-04-admin-requests');
  await page.getByRole('button',{name:'Approve'}).first().click();
  await expect(page.getByText('1 waiting')).toBeVisible();
  expect(decisions).toEqual([{action:'decide',request_id:'r1',decision:'approved',note:'Enjoy the wedding'}]);
 });

 test('switches a bus to the driver\'s phone for GPS and back',async({page})=>{
  const vehicles=[{id:'bus-a',name:'Bus 12',company_id:'a',company_name:'Coyaba Transport',driver_email:'dana.driver@gmail.com',driver_name:'Dana Driver',status:'on_trip',tracking_active:false,current_lat:12.05,current_lng:-61.75,last_location_update:new Date(Date.now()-15*60e3).toISOString()}];
  const {updates}=await admin(page,{vehicles});
  await page.goto('/admin/fleet');
  await page.getByRole('button',{name:/^Bus 12,/}).click();
  await page.getByRole('button',{name:"Use driver's phone for GPS"}).click();
  await expect(page.getByText('Backup GPS on').first()).toBeVisible();
  expect(updates[0]).toMatchObject({backup_gps_driver_email:'dana.driver@gmail.com',tracking_active:true});
  await expect(page.getByText(/Driver's phone \(backup\) since/)).toBeVisible();
  await shot(page,'s3-05-live-fleet-backup');
  await page.getByRole('button',{name:'Stop phone GPS'}).click();
  await expect.poll(()=>updates.length).toBe(2);
  expect(updates[1]).toMatchObject({backup_gps_driver_email:''});
 });
});
