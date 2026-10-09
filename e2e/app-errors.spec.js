import {test,expect} from '@playwright/test';

// Admin → App errors, and the passenger welcome using the chosen name.
const SHOTS=process.env.TT_SHOT_DIR||'';
const shot=async(page,name)=>{ if(SHOTS) await page.screenshot({path:`${SHOTS}/${name}.png`}); };
const ago=(min)=>new Date(Date.now()-min*60000).toISOString();
const UA_TAB='Mozilla/5.0 (Linux; Android 13; SM-T220) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
const UA_PHONE='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const ERRORS=[
 {id:'e1',created_date:ago(3),message:"Cannot read properties of undefined (reading 'stops')",stack:"TypeError: Cannot read properties of undefined (reading 'stops')\n    at RouteCard (assets/StaffPortal-x.js:1:2345)",url:'/home',user_email:'pat@test.local',user_role:'passenger',user_agent:UA_PHONE,source:'boundary',area:'Passenger app',status:'new',
  context:{version:'index-D9dBjP6p',screen:'390x844',online:true,installed:true,language:'en'},
  breadcrumbs:[{t:ago(5),type:'page',text:'/home'},{t:ago(4),type:'tap',text:'Buses'},{t:ago(4),type:'server',text:'entityAccess failed (429): Too many requests'},{t:ago(3),type:'tap',text:'Bus 12'}]},
 {id:'e2',created_date:ago(40),message:"Cannot read properties of undefined (reading 'stops')",stack:'TypeError …',url:'/home',user_email:'sam@test.local',user_role:'passenger',user_agent:UA_PHONE,source:'boundary',area:'Passenger app',status:'new',context:{version:'index-D9dBjP6p',screen:'390x844',online:true},breadcrumbs:[]},
 {id:'e3',created_date:ago(90),message:'Failed to fetch dynamically imported module: /assets/Admin-old.js',stack:'',url:'/admin/fleet',user_email:'admin@test.local',user_role:'admin',user_agent:UA_TAB,source:'promise',area:'Admin',status:'new',context:{version:'index-older',screen:'1280x800',online:true},breadcrumbs:[{t:ago(91),type:'page',text:'/admin/fleet'}]},
 {id:'e4',created_date:ago(200),message:'NotAllowedError: Permission denied',stack:'',url:'/kiosk?code',user_email:'',user_role:'',device_id:'tab-1',user_agent:UA_TAB,source:'promise',area:'Boarding tablet',status:'resolved',resolved_by:'Ada Admin',context:{screen:'1280x800',online:false},breadcrumbs:[]},
];

async function admin(page){
 const updates=[];const rows=structuredClone(ERRORS);
 await page.addInitScript(()=>{ localStorage.setItem('base44_access_token','mock-authenticated-session'); localStorage.setItem('tt-map-engine','basic'); });
 await page.route('https://api.mapbox.com/**',r=>r.fulfill({status:404,body:''}));
 await page.route('**/api/**',async route=>{
  const url=route.request().url();
  if(url.includes('/functions/entityAccess')){
   const body=route.request().postDataJSON();let result=[];
   if(body.entity==='User'&&body.operation==='get') result={id:'admin',email:'admin@test.local',full_name:'Ada Admin',role:'admin'};
   else if(body.entity==='ClientError'&&body.operation==='update'){updates.push(body);const r=rows.find(x=>x.id===body.id);Object.assign(r,body.data);result=r;}
   else if(body.entity==='ClientError') result=rows;
   else if(body.entity==='KioskDevice') result=[{id:'tab-1',label:'Bus 12 boarding tablet'}];
   return route.fulfill({json:{result}});
  }
  if(url.includes('/entities/User/me')) return route.fulfill({json:{id:'admin',role:'admin',email:'admin@test.local',full_name:'Ada Admin'}});
  return route.fulfill({json:{id:'test-app',public_settings:{authentication_required:false}}});
 });
 return {updates};
}

test.describe('admin app errors',()=>{
 test.use({viewport:{width:1280,height:900}});
 test('groups errors and shows who, where, device and the steps before',async({page,context})=>{
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  const {updates}=await admin(page);
  await page.goto('/admin/app-errors');
  const problems=page.getByRole('list',{name:'Problems'});
  await expect(problems.getByRole('button')).toHaveCount(2); // the fixed one is hidden under Open
  await expect(problems.getByRole('button').first()).toContainText('2× · 2 people');
  await expect(page.getByText('pat@test.local · passenger')).toBeVisible();
  await expect(page.getByText('iPhone · Safari · 390x844 · installed app')).toBeVisible();
  await expect(page.getByRole('list',{name:'Steps before the error'}).getByText('entityAccess failed (429): Too many requests')).toBeVisible();
  await expect(page.getByText(/needs a fix in the app/)).toBeVisible();
  await shot(page,'e-01-errors');
  await page.getByRole('heading',{name:'What happened before'}).evaluate(el=>el.scrollIntoView({block:'start'}));
  await page.mouse.wheel(0,-90);
  await shot(page,'e-02-steps');
  await page.getByRole('button',{name:'Copy details'}).click();
  const copied=await page.evaluate(()=>navigator.clipboard.readText());
  expect(copied).toContain('Where: Passenger app · page /home');
  expect(copied).toContain('Tapped: Bus 12');
  await page.getByRole('button',{name:'Mark fixed'}).click();
  await expect.poll(()=>updates.map(u=>[u.id,u.data.status])).toEqual([['e1','resolved'],['e2','resolved']]);
  await expect(problems.getByRole('button')).toHaveCount(1);
  await page.getByRole('group',{name:'Show'}).getByRole('button',{name:'Fixed'}).click();
  await expect(problems.getByRole('button')).toHaveCount(2);
  await problems.getByRole('button',{name:/Permission denied/}).click();
  await expect(page.getByText('Bus 12 boarding tablet (tablet)')).toBeVisible();
 });

 test('fits a phone screen',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await admin(page);
  await page.goto('/admin/app-errors');
  await expect(page.getByRole('list',{name:'Problems'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
 });
});
