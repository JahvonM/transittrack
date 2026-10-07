import {test,expect} from '@playwright/test';

// Step 2: start the shift from the phone (scan or type the tablet's code),
// the walk-around check, End shift and hours, plus the tablet's side.
const SHOTS=process.env.TT_SHOT_DIR||'';
const shot=async(page,name)=>{ if(SHOTS) await page.screenshot({path:`${SHOTS}/${name}.png`}); };

const BUS={id:'bus-a',name:'Bus 12',plate_number:'HA 1234',fleet_number:'12'};
const today=(over={})=>({buses:[BUS],bus:BUS,route:{id:'r',name:'Grand Anse morning',stops:[{name:'Town',order:0},{name:'Grand Anse',order:1}]},
 pickups:[{name:'Jane R.',stop:'Town',skipping:false,late:false}],shift:null,last_shift:null,notices:[],contacts:null,workplace:null,walkaround:null,...over});
const ME={driver:{name:'Dana Driver',email:'dana.driver@gmail.com',phone:''},company:{id:'a',name:'Coyaba Transport'},buses:[BUS]};

async function phone(page,{todayData=today(),hours=[]}={}) {
 const calls=[];const state={today:todayData};
 await page.addInitScript(()=>{ localStorage.setItem('base44_access_token','mock-authenticated-session'); });
 await page.route('https://api.mapbox.com/**',r=>r.fulfill({status:404,body:''}));
 await page.route('**/api/**',async route=>{
  const url=route.request().url();
  if(url.includes('/functions/driverPhone')) {
   const body=route.request().postDataJSON();calls.push(body);
   if(body.action==='claim_bus') {
    if(body.code!=='K7Q4MD') return route.fulfill({status:404,json:{error:'That code didn\'t work. Codes last 2 minutes: tap "Start with the driver app" on the tablet again.'}});
    state.today={...state.today,shift:{id:'s1',mine:true,started_with:'phone',started_at:new Date().toISOString()}};
    return route.fulfill({json:{ok:true,bus:BUS,shift:state.today.shift,resumed:false}});
   }
   if(body.action==='end_shift') { state.today={...state.today,shift:null}; return route.fulfill({json:{ok:true,shift:{duration_minutes:452}}}); }
   if(body.action==='walkaround') {
    const problems=body.items.filter(i=>i.condition==='FAILED').length;
    state.today={...state.today,walkaround:{status:problems?'failed':'passed',created_date:new Date().toISOString()}};
    return route.fulfill({json:{ok:true,inspection:{id:'i1',status:problems?'failed':'passed',problems}}});
   }
   const reply={me:ME,today:state.today,messages:{messages:[]},documents:{documents:[]},hours:{shifts:hours},register_push:{ok:true}}[body.action];
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

 test('typing the tablet code starts the shift',async({page})=>{
  const calls=await phone(page);
  await page.goto('/driver-phone');
  await expect(page.getByText('Walk-around not done today')).toBeVisible();
  await shot(page,'s2-01-today');
  await page.getByRole('button',{name:'Start shift'}).click();
  await expect(page.getByRole('heading',{name:'Start shift'})).toBeVisible();
  await page.getByRole('button',{name:/Can't scan\? Type the code/}).click();
  await page.getByLabel('Bus code').fill('abc 999');
  await page.getByRole('button',{name:'Start',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText("didn't work");
  await page.getByLabel('Bus code').fill('k7q 4md');
  await shot(page,'s2-02-start');
  await page.getByRole('button',{name:'Start',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Shift started'})).toBeVisible();
  await shot(page,'s2-03-started');
  expect(calls.filter(c=>c.action==='claim_bus').map(c=>c.code)).toEqual(['ABC999','K7Q4MD']);
  await page.getByRole('button',{name:'Done'}).click();
  await expect(page.getByText(/^On shift since/)).toBeVisible();
  await expect(page.getByRole('button',{name:'End shift'})).toBeVisible();
 });

 test('opening the QR link from the phone camera asks once, then starts',async({page})=>{
  const calls=await phone(page);
  await page.goto('/driver-phone/start?code=K7Q4MD');
  await expect(page.getByText('K7Q 4MD')).toBeVisible();
  expect(calls.some(c=>c.action==='claim_bus')).toBe(false);
  await page.getByRole('button',{name:'Start my shift'}).click();
  await expect(page.getByRole('heading',{name:'Shift started'})).toBeVisible();
 });

 test('walk-around: every item, problems need a note, then it is sent',async({page})=>{
  const calls=await phone(page);
  await page.goto('/driver-phone/start');
  await page.getByRole('button',{name:'Check now'}).click();
  await expect(page.getByRole('heading',{name:'Walk-around check'})).toBeVisible();
  const items=['Tyres and wheels','Lights and indicators','Mirrors','Windscreen and wipers','Bodywork','No leaks under the bus','Doors and emergency exits','Seats, belts and floor','First aid kit and fire extinguisher'];
  for(const i of items) await page.getByRole('button',{name:`${i}: ${i==='Mirrors'?'problem':'OK'}`}).click();
  await page.getByRole('button',{name:'Send check'}).click();
  await expect(page.getByRole('alert')).toContainText('Mirrors');
  await page.getByLabel("What's wrong with Mirrors").fill('Left mirror cracked');
  await shot(page,'s2-04-walkaround');
  await page.getByRole('button',{name:'Send check'}).click();
  await expect(page.getByRole('heading',{name:'Problems sent'})).toBeVisible();
  const sent=calls.find(c=>c.action==='walkaround');
  expect(sent.items).toHaveLength(9);
  expect(sent.items.find(i=>i.id==='mirrors')).toMatchObject({condition:'FAILED',notes:'Left mirror cracked'});
  await page.getByRole('button',{name:'Continue'}).click();
  await expect(page.getByRole('heading',{name:'Start shift'})).toBeVisible();
  await expect(page.getByText(/Done at .*problems sent to the mechanic/)).toBeVisible();
 });

 test('End shift asks first, then ends it',async({page})=>{
  const calls=await phone(page,{todayData:today({shift:{id:'s1',mine:true,started_with:'phone',started_at:new Date(Date.now()-7.5*3600e3).toISOString()},walkaround:{status:'passed',created_date:new Date(Date.now()-7.6*3600e3).toISOString()}})});
  await page.goto('/driver-phone');
  await expect(page.getByText(/^On shift since/)).toBeVisible();
  await shot(page,'s2-05-on-shift');
  await page.getByRole('button',{name:'End shift'}).click();
  await expect(page.getByRole('alertdialog')).toContainText('End your shift?');
  await page.getByRole('alertdialog').getByRole('button',{name:'End shift'}).click();
  await expect(page.getByText('Shift ended').first()).toBeVisible();
  expect(calls.some(c=>c.action==='end_shift')).toBe(true);
 });

 test('Me shows hours this week',async({page})=>{
  const monday=new Date();monday.setHours(6,30,0,0);monday.setDate(monday.getDate()-((monday.getDay()+6)%7));
  const at=(days,h,m=0)=>{const d=new Date(monday);d.setDate(d.getDate()+days);d.setHours(h,m,0,0);return d.toISOString();};
  const shifts=[{id:'a',vehicle_name:'Bus 12',started_at:at(0,6,30),ended_at:at(0,14,15),minutes:465,started_with:'phone'},
   {id:'old',vehicle_name:'Bus 12',started_at:at(-3,6,30),ended_at:at(-3,14,0),minutes:450,started_with:'tablet'}];
  await phone(page,{hours:shifts});
  await page.goto('/driver-phone/me');
  await expect(page.getByText('7 h 45 min',{exact:true})).toBeVisible();
  await expect(page.getByText(/^1 shift since Monday/)).toBeVisible();
  await shot(page,'s2-06-hours');
 });
});

test.describe('bus tablet',()=>{
 test.use({viewport:{width:800,height:1280}});
 test('Start with the driver app shows a code and unlocks when a phone claims it',async({page})=>{
  const calls=[];let polls=0;
  const vehicle={id:'bus-a',name:'Bus 12',company_id:'company-a',capacity:25,status:'idle'};
  const ctx={vehicle,driver_name:'Dana Driver',has_driver_pin:true,occupancy:0,staff:[],check_ins:[],broadcasts:[],group_messages:[],trips:[],inspection_templates:[],recent_inspections:[],open_shift:null,emergency_contacts:{boss_phone:'',secretary_phone:''}};
  await page.addInitScript(()=>{ localStorage.setItem('tt_driver_device_id','driver-test'); localStorage.setItem('tt_driver_unlock_date','2000-01-01'); });
  await page.route('**/api/**',async route=>{
   const url=route.request().url();const body=route.request().postDataJSON();
   if(url.includes('/functions/driverSession')) {
    calls.push(body);
    if(body?.action==='phone_unlock_code') return route.fulfill({json:{unlock_id:'u1',code:'K7Q4MD',expires_at:new Date(Date.now()+120e3).toISOString()}});
    if(body?.action==='phone_unlock_status') return route.fulfill({json:++polls<2?{status:'pending'}:{status:'unlocked',driver_name:'Dana Driver',driver_grant:'b'.repeat(64)}});
    return route.fulfill({json:ctx});
   }
   if(url.includes('/entities/')) return route.fulfill({status:403,json:{error:'blocked'}});
   return route.fulfill({json:{id:'test-app',public_settings:{authentication_required:false}}});
  });
  await page.goto('/driver');
  await expect(page.getByText('Driver PIN required')).toBeVisible();
  await shot(page,'s2-07-tablet-lock');
  await page.getByRole('button',{name:/Start with the driver app/}).click();
  await expect(page.getByRole('img',{name:/QR code to start your shift on Bus 12/})).toBeVisible();
  await expect(page.getByText('K7Q 4MD')).toBeVisible();
  await expect(page.getByText('Driver PIN required')).toBeHidden();
  await shot(page,'s2-08-tablet-qr');
  await expect(page.getByText('Unlocked for Dana Driver').first()).toBeVisible({timeout:15000});
  await expect(page.getByText('Driver PIN required')).toBeHidden();
  expect(calls.filter(c=>c.action==='phone_unlock_status').every(c=>c.unlock_id==='u1')).toBe(true);
  expect(await page.evaluate(()=>JSON.stringify(localStorage))).toContain('b'.repeat(64));
 });

 test('Use the PIN instead brings the keypad back',async({page})=>{
  await page.addInitScript(()=>{ localStorage.setItem('tt_driver_device_id','driver-test'); localStorage.setItem('tt_driver_unlock_date','2000-01-01'); });
  await page.route('**/api/**',async route=>{
   const url=route.request().url();const body=route.request().postDataJSON();
   if(url.includes('/functions/driverSession')) {
    if(body?.action==='phone_unlock_code') return route.fulfill({json:{unlock_id:'u1',code:'K7Q4MD',expires_at:new Date(Date.now()+120e3).toISOString()}});
    if(body?.action==='phone_unlock_status') return route.fulfill({json:{status:'pending'}});
    return route.fulfill({json:{vehicle:{id:'bus-a',name:'Bus 12',company_id:'c'},driver_name:'Dana',has_driver_pin:true,staff:[],check_ins:[],broadcasts:[],group_messages:[],trips:[],inspection_templates:[],recent_inspections:[],open_shift:null}});
   }
   return route.fulfill({json:{id:'test-app',public_settings:{authentication_required:false}}});
  });
  await page.goto('/driver');
  await page.getByRole('button',{name:/Start with the driver app/}).click();
  await page.getByRole('button',{name:'Use the PIN instead'}).click();
  await expect(page.getByText('Driver PIN required')).toBeVisible();
 });
});
