import {test,expect} from '@playwright/test';
const vehicle={id:'bus-a',name:'Bus A',company_id:'a',company_name:'Island Transit',status:'idle',type:'bus',capacity:25};
const profile={id:'admin',role:'admin',email:'admin@test.invalid',full_name:'Admin'};
const users=[profile,{id:'viewer',role:'staff',email:'viewer@test.invalid',full_name:'Fleet Viewer'}];
async function setup(page,{custom=false,layout='auto',sign=null}={}){
 const roles=[{id:'fleet-role',name:'Fleet supervisor',sections:['fleet'],active:true}],calls=[],messages=[];
 const driver={vehicle,company_id:'a',company_name:'Island Transit',driver_name:'Test Driver',has_driver_pin:true,driver_unlocked:true,
  staff:[],check_ins:[],broadcasts:[],group_messages:[],trips:[],inspection_templates:[],recent_inspections:[],open_shift:null,emergency_contacts:{}};
 const kiosk={device_id:'board',paired:true,status:'active',kiosk_type:'bus_boarding',company_id:'a',company_name:'Island Transit',
  vehicle_id:'bus-a',vehicle_name:'Bus A',display_layout:layout,pickup_sign:sign,
  context:{vehicle,route:null,occupancy:4,today_count:10,ads:[]}};
 const who=custom?{id:'viewer',role:'staff',email:'viewer@test.invalid',full_name:'Fleet Viewer',access_role:{id:'fleet-role',name:'Fleet supervisor',sections:['fleet']}}:profile;
 const tables={Vehicle:[vehicle],User:users,Company:[{id:'a',name:'Island Transit'}],Route:[],Workplace:[],GroupMessage:messages};
 await page.addInitScript(()=>{
  localStorage.setItem('base44_access_token','mock-authenticated-session');
  localStorage.setItem('tt_driver_device_id','driver');
  localStorage.setItem('tt_kiosk_device_id','board');
  localStorage.setItem('tt_device_token_board','a'.repeat(64));
  localStorage.setItem('tt-map-engine','basic');
  navigator.geolocation.watchPosition=()=>1;
  navigator.geolocation.clearWatch=()=>{};
 });
 await page.route('https://api.mapbox.com/**',route=>route.request().url().includes('/styles/v1/')?
  route.fulfill({json:{version:8,sources:{},layers:[{id:'bg',type:'background',paint:{'background-color':'#10243d'}}]}}):
  route.fulfill({status:404,body:''}));
 await page.route('**/api.open-meteo.com/**',route=>route.fulfill({json:{current:{temperature_2m:29,weather_code:1}}}));
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=req.url();let b={};try{b=req.postDataJSON()||{};}catch{}
  if(url.includes('/entities/User/me'))return route.fulfill({json:who});
  if(url.includes('/functions/entityAccess')){
   let result=[];
   if(b.entity==='User' && b.operation==='get')result=who;
   else if(b.entity==='AdminBootstrap'){
    const specs={vehicles:'Vehicle',companies:'Company',users:'User',routes:'Route'};
    result={datasets:Object.fromEntries((b.datasets || []).map(key=>[key,tables[specs[key]]||[]])),errors:{}};
   }else if(b.entity==='LiveLists')result={lists:Object.fromEntries((b.entities||[]).map(name=>[name,tables[name] || []])),errors:{}};
   else if(b.entity==='GroupMessage' && b.operation==='create'){
    result={id:'m'+(messages.length+1),...b.data,created_date:new Date().toISOString()};messages.push(result);
   }else result=tables[b.entity] || [];
   return route.fulfill({json:{result}});
  }
  if(url.includes('/functions/accessRoles')){
   calls.push(b);
   if(b.action==='workspace')return route.fulfill(b.section==='fleet'?{json:{fields:['name','plate_number','status'],rows:[vehicle],more:false,role:who.access_role}}:{status:403,json:{error:'Screen not permitted'}});
   if(b.action==='save'){
    const role={id:b.role_id || 'new-role',name:b.name,sections:b.sections,active:b.active};
    const index=roles.findIndex(r=>r.id===role.id);if(index>=0)roles[index]=role;else roles.push(role);
    return route.fulfill({json:{role}});
   }
   if(b.action==='assign')return route.fulfill({json:{ok:true}});
   return route.fulfill({json:{roles,assignments:[]}});
  }
  if(url.includes('/functions/driverSession')){
   if(b.action==='verify_pin')return route.fulfill({json:{ok:true,driver_grant:'a'.repeat(64)}});
   if(b.action==='messages')return route.fulfill({json:{group_messages:messages}});
   if(b.action==='show_pickup_sign'){calls.push(b);return route.fulfill({json:{ok:true,devices:1}});}
   return route.fulfill({json:{...driver,group_messages:messages}});
  }
  if(url.includes('/functions/kioskHeartbeat'))return route.fulfill({json:kiosk});
  if(url.includes('/functions/kioskCheckIn')){
   if(b.action==='lookup_tag')return route.fulfill({json:{staff:{id:'p',full_name:'Test Passenger'},next_status:'boarded',verification_grant:'b'.repeat(64)}});
   if(b.action==='offline_directory')return route.fulfill({json:{staff:[]}});
   return route.fulfill({json:{ok:true}});
  }
  if(url.includes('/functions/notifyAdminMessage')){calls.push({notify:b});return route.fulfill({json:{ok:true}});}
  if(url.includes('/entities/'))return route.fulfill({status:403,json:{error:'Direct access blocked'}});
  return route.fulfill({json:{id:'test-app',public_settings:{authentication_required:false}}});
 });
 return {calls,messages,driver};
}
test('route planner switches map styles and offers current location',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await setup(page);await page.goto('/admin/route-planner');
 const styles=page.getByRole('combobox',{name:'Map style'});
 await expect(styles).toBeVisible();
 await styles.selectOption('satellite');await expect(styles).toHaveValue('satellite');
 await styles.selectOption('dark');await expect(styles).toHaveValue('dark');
 await expect(page.getByRole('button',{name:/Find my location/})).toBeVisible();
 await page.screenshot({path:'/tmp/tt-route-map-controls.png'});
});
test('phone kiosk has dedicated mode controls and no horizontal overflow',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await setup(page,{layout:'phone'});await page.goto('/kiosk');
 await expect(page.locator('[data-layout=phone]')).toBeVisible();
 await expect(page.getByRole('navigation',{name:'Phone kiosk'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Tablet & reader',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Full screen',exact:true})).toBeVisible();
 expect(await page.locator('.tt-kiosk-phone').evaluate(e=>e.getBoundingClientRect().height<=innerHeight+1)).toBe(true);
 await page.getByRole('button',{name:'Enter code',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Enter your boarding code'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Submit code',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'/tmp/tt-phone-kiosk.png',fullPage:true});
 await page.getByRole('button',{name:'Bus info',exact:true}).click();
 await expect(page.getByLabel('Bus information')).toBeVisible();
 await page.getByRole('button',{name:'Tap card',exact:true}).click();
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('tt-badge',{detail:'04AABBCC'})));
 await expect(page.getByText('Are you boarding or exiting?')).toBeVisible();
});
test('pickup name sign is on the boarding device and can be closed',async({page})=>{
 await page.setViewportSize({width:800,height:1280});
 await setup(page,{sign:{id:'sign-1',name:'JANE GUEST',subtitle:'Hotel group',expires_at:new Date(Date.now()+60000).toISOString()}});
 await page.goto('/kiosk');
 await expect(page.getByRole('dialog',{name:'Name sign'})).toBeVisible();
 await expect(page.getByText('JANE GUEST',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Close the sign'}).click();
 await expect(page.getByRole('dialog',{name:'Name sign'})).toBeHidden();
 await expect(page.getByText('Tap your card to begin')).toBeVisible();
});
test('admin can save checked custom role screens and assign an account',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});
 const {calls}=await setup(page);await page.goto('/admin/users');
 await expect(page.getByRole('heading',{name:'Custom roles',exact:true})).toBeVisible();
 await page.getByRole('textbox',{name:'Custom role name'}).fill('Dispatch viewer');
 await page.getByRole('checkbox',{name:'Live fleet',exact:true}).check();
 await page.getByRole('checkbox',{name:'Maintenance schedule',exact:true}).check();
 await page.getByRole('button',{name:'Save custom role',exact:true}).click();
 await expect.poll(()=>calls.some(b=>b.action==='save')).toBe(true);
 expect(calls.find(b=>b.action==='save').sections.sort()).toEqual(['fleet','schedule']);
 await page.getByRole('combobox',{name:'Custom role account'}).selectOption('viewer');
 await page.getByRole('combobox',{name:'Assign custom role'}).selectOption('new-role');
 await page.getByRole('button',{name:'Apply assignment'}).click();
 await expect.poll(()=>calls.some(b=>b.action==='assign' && b.user_id==='viewer')).toBe(true);
 await page.screenshot({path:'/tmp/tt-custom-role-editor.png',fullPage:true});
});
test('assigned role sees only its checked screens and direct admin URL redirects',async({page})=>{
 await setup(page,{custom:true});await page.goto('/admin/users');
 await expect(page).toHaveURL(/\/workspace\/fleet$/);
 const nav=page.getByRole('navigation',{name:'Assigned screens'});
 await expect(nav.getByRole('link')).toHaveCount(1);
 await expect(nav.getByRole('link',{name:'Live fleet'})).toBeVisible();
 await expect(page.getByRole('cell',{name:'Bus A',exact:true})).toBeVisible();
 await page.goto('/workspace/billing');
 await expect(page.getByRole('alert')).toContainText('not included in your role');
});
test('incoming bus chat pops up for two seconds and stays in message history',async({page})=>{
 await page.setViewportSize({width:800,height:1280});
 const {messages}=await setup(page);await page.goto('/driver/track');
 await page.locator('input[type=password]').fill('1234');
 await page.getByRole('button',{name:'Unlock',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Your journey'})).toBeVisible();
 messages.push({id:'incoming',company_id:'a',vehicle_id:'bus-a',sender_role:'admin',sender_name:'Dispatch',text:'Please collect the hotel guests',channel:'dispatch',created_date:new Date().toISOString()});
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 const popup=page.getByRole('status').filter({hasText:'Please collect the hotel guests'});
 await expect(popup).toBeVisible();
 await expect(popup).toBeHidden({timeout:4000});
 await page.getByRole('button',{name:'Open driver messages'}).click();
 await page.getByText('Dispatch',{exact:true}).first().click();
 await expect(page.getByText('Please collect the hotel guests',{exact:true})).toBeVisible();
});
