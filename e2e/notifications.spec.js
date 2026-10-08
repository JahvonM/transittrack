import {test,expect} from '@playwright/test';

// Admin → Notifications: switch a kind off, untick people, save, and test.
const SHOTS=process.env.TT_SHOT_DIR||'';
const shot=async(page,name)=>{ if(SHOTS) await page.screenshot({path:`${SHOTS}/${name}.png`}); };
const ago=(min)=>new Date(Date.now()-min*60000).toISOString();

const TYPES=[
 {key:'sos',channel:'push',label:'SOS alert',when:'A driver holds the SOS button on the bus tablet.',audiences:['admin'],locked:true},
 {key:'chat_message',channel:'push',label:'Chat messages',when:'Someone posts in a bus chat.',audiences:['admin','company','passenger']},
 {key:'crash_alert',channel:'email',label:'Crash alert',when:'A screen in the app crashes. At most five emails an hour.',audiences:['admin']},
 {key:'weekly_report',channel:'email',label:'Weekly report',when:'Once a week: trips, incidents, faults and maintenance.',audiences:['admin']},
 {key:'maintenance_due',channel:'email',label:'Maintenance due',when:'Servicing is due soon or overdue.',audiences:['admin','company','mechanic']},
];
const PEOPLE={
 admin:[{email:'admin@test.local',name:'Ada Admin',company:''},{email:'boss@test.local',name:'Ben Boss',company:''}],
 company:[{email:'manager@test.local',name:'Mia Manager',company:'Coyaba Transport'}],
 mechanic:[{email:'mech@test.local',name:'Mo Mechanic',company:''}],
 passenger:[{email:'pat@test.local',name:'Pat Passenger',company:'Coyaba Transport'}],
 driver:[],
};
const RECENT=[
 {id:'l1',key:'chat_message',channel:'push',title:'Bus 12 · Dana Driver',status:'sent',recipients:['admin@test.local','pat@test.local'],recipient_count:2,sent:2,failed:0,skipped:0,error:'',sent_at:ago(4)},
 {id:'l2',key:'weekly_report',channel:'email',title:'TransitTrack weekly report',status:'partial',recipients:['admin@test.local','boss@test.local'],recipient_count:2,sent:1,failed:1,skipped:0,error:'Mailbox unavailable',sent_at:ago(90)},
 {id:'l3',key:'crash_alert',channel:'email',title:'TransitTrack crash alert: Cannot read properties of null',status:'held',recipients:[],recipient_count:0,sent:0,failed:0,skipped:2,error:'',sent_at:ago(300)},
];

async function admin(page){
 const calls=[];const state={settings:{crash_alert:{enabled:true,blocked_emails:['boss@test.local'],updated_by:'Ada Admin'}},recent:[...RECENT]};
 await page.addInitScript(()=>{ localStorage.setItem('base44_access_token','mock-authenticated-session'); localStorage.setItem('tt-map-engine','basic'); });
 await page.route('https://api.mapbox.com/**',r=>r.fulfill({status:404,body:''}));
 await page.route('**/api/**',async route=>{
  const url=route.request().url();
  if(url.includes('/functions/notificationSettings')) {
   const body=route.request().postDataJSON();calls.push(body);
   if(body.action==='overview') return route.fulfill({json:{types:TYPES,settings:state.settings,people:PEOPLE,recent:state.recent,me:'admin@test.local'}});
   if(body.action==='save'){ state.settings[body.key]={enabled:body.enabled,blocked_emails:body.blocked_emails,updated_by:'Ada Admin'}; return route.fulfill({json:{ok:true,setting:state.settings[body.key]}}); }
   if(body.action==='test'){ state.recent.unshift({id:'t',key:'test',channel:'email',title:'TransitTrack test notification',status:'sent',recipients:['admin@test.local'],recipient_count:1,sent:1,failed:0,skipped:0,error:'',sent_at:new Date().toISOString()}); return route.fulfill({json:{ok:true,to:'admin@test.local'}}); }
   if(body.action==='recent') return route.fulfill({json:{recent:state.recent}});
  }
  if(url.includes('/functions/entityAccess')) {
   const body=route.request().postDataJSON();
   const result=body.entity==='User'&&body.operation==='get'?{id:'admin',email:'admin@test.local',full_name:'Ada Admin',role:'admin'}:[];
   return route.fulfill({json:{result}});
  }
  if(url.includes('/entities/User/me')) return route.fulfill({json:{id:'admin',role:'admin',email:'admin@test.local',full_name:'Ada Admin'}});
  return route.fulfill({json:{id:'test-app',public_settings:{authentication_required:false}}});
 });
 return {calls,state};
}

test.describe('admin notifications',()=>{
 test.use({viewport:{width:1280,height:900}});

 test('shows every kind, unticks a person and switches a kind off',async({page})=>{
  const {calls}=await admin(page);
  await page.goto('/admin/notifications');
  const kinds=page.getByRole('list',{name:'Notifications'});
  await expect(kinds.getByRole('button',{name:/SOS alert/})).toContainText('Always on');
  await expect(kinds.getByRole('button',{name:/Crash alert/})).toContainText('1 of 2 people');
  await expect(page.getByText('Mailbox unavailable').first()).toBeVisible();
  await shot(page,'n-01-overview');

  // SOS can't be switched off.
  await expect(page.getByRole('switch')).toHaveCount(0);
  await kinds.getByRole('button',{name:/Weekly report/}).click();
  await page.getByRole('checkbox',{name:/Ben Boss/}).click();
  await expect(page.getByText('Unsaved changes')).toBeVisible();
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect.poll(()=>calls.find(c=>c.action==='save')).toMatchObject({key:'weekly_report',enabled:true,blocked_emails:['boss@test.local']});
  await expect(kinds.getByRole('button',{name:/Weekly report/})).toContainText('1 of 2 people');

  await kinds.getByRole('button',{name:/Maintenance due/}).click();
  await page.getByRole('textbox',{name:'Search people'}).fill('mia');
  await expect(page.getByRole('checkbox')).toHaveCount(1);
  await page.getByRole('textbox',{name:'Search people'}).fill('');
  await page.getByRole('switch',{name:'Send Maintenance due'}).click();
  await expect(page.getByText(/Switched off: nobody gets this email/)).toBeVisible();
  await shot(page,'n-02-switched-off');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect.poll(()=>calls.filter(c=>c.action==='save').at(-1)).toMatchObject({key:'maintenance_due',enabled:false});
  await expect(kinds.getByRole('button',{name:/Maintenance due/})).toContainText('Off');
 });

 test('sends a test email to the admin',async({page})=>{
  await admin(page);
  await page.goto('/admin/notifications');
  await page.getByRole('button',{name:'Test email to me'}).click();
  await expect(page.getByText('Test email sent',{exact:true})).toBeVisible();
  await expect(page.getByText('Test · TransitTrack test notification').first()).toBeVisible();
 });

 test('fits a phone screen',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await admin(page);
  await page.goto('/admin/notifications');
  await page.getByRole('list',{name:'Notifications'}).getByRole('button',{name:/Chat messages/}).click();
  await expect(page.getByRole('checkbox',{name:/Pat Passenger/})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
  await shot(page,'n-03-phone-list');
  await page.getByRole('heading',{name:/Who gets it/}).evaluate(el=>el.scrollIntoView({block:'start'}));
  await shot(page,'n-04-phone-people');
 });
});
