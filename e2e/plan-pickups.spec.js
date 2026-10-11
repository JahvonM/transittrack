import {test,expect} from '@playwright/test';

// Admin → Plan pickups: every passenger sorted by whether their bus drives
// past their pickup. Nothing changes until the admin taps Assign.
const SHOTS=process.env.TT_SHOT_DIR||'';
const shot=async(page,name)=>{ if(SHOTS) await page.screenshot({path:`${SHOTS}/${name}.png`,fullPage:true}); };

const road=(lat)=>[{lat,lng:-61.76},{lat,lng:-61.74}];
function planData(){
 return {
  companies:[{id:'a',name:'Company A'},{id:'b',name:'Company B'}],
  routes:[
   {id:'r1',name:'Coastal',company_id:'a',has_road:true,path:road(12.0),stops:[]},
   {id:'r2',name:'Hills',company_id:'a',has_road:true,path:road(12.03),stops:[]},
   {id:'r3',name:'New estate',company_id:'a',has_road:true,path:road(12.01),stops:[]},
  ],
  buses:[
   {id:'bus-1',name:'White bus',company_id:'a',route_id:'r1',route_name:'Coastal',capacity:30,riders:12},
   {id:'bus-2',name:'Blue bus',company_id:'a',route_id:'r2',route_name:'Hills',capacity:20,riders:19},
   {id:'bus-3',name:'Spare van',company_id:'a',route_id:'',route_name:'',capacity:14,riders:0},
   {id:'bus-b',name:'Other company bus',company_id:'b',route_id:'',route_name:'',capacity:10,riders:0},
  ],
  people:[
   {key:'user:ok',company_id:'a',name:'Olu Okafor',status:'ok',pickup:{lat:12.0,lng:-61.755,name:'Market'},route_id:'r1',route_name:'Coastal',bus_id:'bus-1',bus_name:'White bus'},
   {key:'contact:needs',company_id:'a',name:'Nia Needs',status:'needs_bus',pickup:{lat:12.0,lng:-61.75,name:'Church'},route_id:'r1',route_name:'Coastal',suggested:{id:'bus-1',name:'White bus'}},
   {key:'user:needs2',company_id:'a',name:'Ned North',status:'needs_bus',pickup:{lat:12.03,lng:-61.75,name:'Hilltop'},route_id:'r2',route_name:'Hills',suggested:{id:'bus-2',name:'Blue bus'}},
   {key:'user:wrong',company_id:'a',name:'Wes Wrong',status:'wrong_bus',pickup:{lat:12.0,lng:-61.745,name:'Bay'},route_id:'r1',route_name:'Coastal',bus_id:'bus-2',bus_name:'Blue bus',suggested:{id:'bus-1',name:'White bus'}},
   {key:'user:nobus',company_id:'a',name:'Ella Estate',status:'route_no_bus',pickup:{lat:12.01,lng:-61.75,name:'Estate gate'},route_id:'r3',route_name:'New estate',nearby:{bus_id:'bus-1',bus_name:'White bus',route_id:'r1',route_name:'Coastal',distance_m:1100}},
   {key:'user:far',company_id:'a',name:'Faye Far',status:'no_route',pickup:{lat:12.06,lng:-61.7,name:'Ridge'},nearby:null},
   {key:'user:none',company_id:'a',name:'Noah None',status:'no_pickup',pickup:null},
   {key:'user:b',company_id:'b',name:'Bea Bee',status:'no_pickup',pickup:null},
  ],
 };
}

async function admin(page){
 const calls={setBus:[],vehicle:[],plans:0};
 let plan=planData();
 await page.addInitScript(()=>{ localStorage.setItem('base44_access_token','mock-authenticated-session'); });
 await page.route('https://api.mapbox.com/**',r=>r.fulfill({status:404,body:''}));
 await page.route(/basemaps|cartocdn|tile/,r=>r.fulfill({status:404,body:''}));
 await page.route('**/api/**',async route=>{
  const url=route.request().url();
  if(url.includes('/functions/routeStops')){ calls.plans++; return route.fulfill({json:plan}); }
  if(url.includes('/functions/nfcCards')){
   const body=route.request().postDataJSON();calls.setBus.push(body);
   // The server moves them onto the bus; the next plan shows them as sorted,
   // except someone the bus only passes nearby (they still need a new pickup).
   plan={...plan,people:plan.people.map(p=>{
    if(p.key!==body.person_key) return p;
    const moved={...p,bus_id:body.vehicle_id,bus_name:plan.buses.find(b=>b.id===body.vehicle_id)?.name};
    return ['route_no_bus','no_route'].includes(p.status)?moved:{...moved,status:'ok'};
   })};
   return route.fulfill({json:{ok:true}});
  }
  if(url.includes('/entities/User/me')) return route.fulfill({json:{id:'admin',role:'admin',email:'admin@test.local',full_name:'Ada Admin'}});
  if(url.includes('/functions/entityAccess')){
   const body=route.request().postDataJSON();let result=[];
   if(body.entity==='User'&&body.operation==='get') result={id:'admin',role:'admin',email:'admin@test.local',full_name:'Ada Admin'};
   else if(body.entity==='Vehicle'&&body.operation==='update'){
    calls.vehicle.push(body);
    const route_name=plan.routes.find(r=>r.id===body.data.route_id)?.name;
    plan={...plan,
     buses:plan.buses.map(b=>b.id===body.id?{...b,route_id:body.data.route_id,route_name}:b),
     people:plan.people.map(p=>p.status==='route_no_bus'&&p.route_id===body.data.route_id?{...p,status:'needs_bus',suggested:{id:body.id,name:plan.buses.find(b=>b.id===body.id).name}}:p)};
    result={id:body.id,...body.data};
   }
   return route.fulfill({json:{result}});
  }
  if(url.includes('/entities/')) return route.fulfill({json:[]});
  return route.fulfill({json:{id:'test-app',public_settings:{authentication_required:false}}});
 });
 return calls;
}

const confirm=async(page,label)=>{ const d=page.getByRole('alertdialog').or(page.getByRole('dialog')); await d.getByRole('button',{name:label,exact:true}).click(); };

test.use({viewport:{width:1440,height:900}});

test('pickup workspace searches, filters, reviews details and fits tablet and phone',async({page})=>{
 await admin(page);
 await page.goto('/admin/plan-pickups');
 const list=page.getByRole('list',{name:'Pickup passengers'});
 await expect(list).toContainText('Nia Needs');
 await expect(list).not.toContainText('Olu Okafor');
 await page.getByRole('button',{name:'Review Wes Wrong',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Wes Wrong’s pickup'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Assign Wes Wrong to White bus'})).toBeVisible();
 await page.getByRole('combobox',{name:'Filter pickup issues'}).click();
 await page.getByRole('option',{name:'Needs a bus',exact:true}).click();
 await expect(list).not.toContainText('Wes Wrong');
 await page.getByRole('textbox',{name:'Search passenger or pickup'}).fill('Church');
 await expect(list).toContainText('Nia Needs');
 await expect(list).not.toContainText('Ned North');
 await page.getByRole('textbox',{name:'Search passenger or pickup'}).fill('');
 await page.getByRole('group',{name:'Passenger status'}).getByRole('button',{name:/Ready/}).click();
 await expect(list).toContainText('Olu Okafor');
 await page.getByRole('group',{name:'Passenger status'}).getByRole('button',{name:/No pickup/}).click();
 await expect(list).toContainText('Bea Bee');
 await page.getByRole('combobox',{name:'Company',exact:true}).click();
 await page.getByRole('option',{name:'Company A',exact:true}).click();
 await expect(list).not.toContainText('Bea Bee');
 await page.getByRole('group',{name:'Passenger status'}).getByRole('button',{name:/Needs attention/}).click();
 await page.getByRole('combobox',{name:'Filter pickup issues'}).click();
 await page.getByRole('option',{name:'All issues',exact:true}).click();
 await page.getByRole('button',{name:'Review Nia Needs',exact:true}).click();
 await shot(page,'plan-pickups');
 for(const width of [1024,800,390]){
   await page.setViewportSize({width,height:900});
   await expect(list).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 }
 await shot(page,'plan-pickups-phone');
});

test('single and selected assignments require confirmation and send exact passenger and bus IDs',async({page})=>{
 const calls=await admin(page);
 await page.goto('/admin/plan-pickups');
 await page.getByRole('button',{name:'Review Nia Needs',exact:true}).click();
 await page.getByRole('button',{name:'Assign Nia Needs to White bus'}).click();
 expect(calls.setBus).toHaveLength(0);
 await confirm(page,'Cancel');
 expect(calls.setBus).toHaveLength(0);
 await page.getByRole('button',{name:'Assign Nia Needs to White bus'}).click();
 await confirm(page,'Assign passenger');
 await expect.poll(()=>calls.setBus.length).toBe(1);
 expect(calls.setBus[0]).toEqual({action:'set_bus',person_key:'contact:needs',vehicle_id:'bus-1'});
 await page.getByRole('checkbox',{name:'Select Ned North',exact:true}).check();
 await page.getByRole('checkbox',{name:'Select Wes Wrong',exact:true}).check();
 await page.getByRole('button',{name:'Review assignments'}).click();
 await expect(page.getByRole('alertdialog')).toContainText('Ned North → Blue bus');
 await expect(page.getByRole('alertdialog')).toContainText('Wes Wrong → White bus');
 expect(calls.setBus).toHaveLength(1);
 await confirm(page,'Confirm assignments');
 await expect.poll(()=>calls.setBus.length).toBe(3);
 expect(calls.setBus.slice(1).map(c=>[c.person_key,c.vehicle_id])).toEqual([['user:needs2','bus-2'],['user:wrong','bus-1']]);
 await expect(page.getByRole('button',{name:'Review assignments'})).toBeDisabled();
});

test('route without a bus retains company-safe route placement without assigning passengers',async({page})=>{
 const calls=await admin(page);
 await page.goto('/admin/plan-pickups');
 await page.getByRole('button',{name:'Review Ella Estate',exact:true}).click();
 const group=page.getByRole('region',{name:'New estate: waiting'});
 await group.getByRole('combobox',{name:'Bus for New estate'}).click();
 await expect(page.getByRole('option',{name:/Other company bus/})).toHaveCount(0);
 await page.getByRole('option',{name:'Spare van',exact:true}).click();
 await group.getByRole('button',{name:'Put bus on route'}).click();
 expect(calls.vehicle).toHaveLength(0);
 await confirm(page,'Put bus on route');
 await expect.poll(()=>calls.vehicle.length).toBe(1);
 expect(calls.vehicle[0]).toMatchObject({entity:'Vehicle',operation:'update',id:'bus-3',data:{route_id:'r3'}});
 await expect(page.getByRole('button',{name:'Assign Ella Estate to Spare van'})).toBeVisible();
 expect(calls.setBus).toHaveLength(0);
});

test('nearby bus requires pickup warning and does not hide unresolved pickup',async({page})=>{
 const calls=await admin(page);
 await page.goto('/admin/plan-pickups');
 await page.getByRole('button',{name:'Review Ella Estate',exact:true}).click();
 await expect(page.getByText('Their pickup must move onto this bus’s route.')).toBeVisible();
 await page.getByRole('button',{name:'Assign Ella Estate to White bus'}).click();
 await expect(page.getByRole('alertdialog')).toContainText('pickup still needs to move');
 await confirm(page,'Assign passenger');
 await expect.poll(()=>calls.setBus.length).toBe(1);
 expect(calls.setBus[0]).toMatchObject({person_key:'user:nobus',vehicle_id:'bus-1'});
 await expect(page.getByText(/On White bus, which passes 1.1 km away/)).toBeVisible();
 await expect(page.getByRole('button',{name:'Assign Ella Estate to White bus'})).toHaveCount(0);
});

test('selected assignments keep failed passengers selected and continue later passengers',async({page})=>{
 const calls=await admin(page);
 let rejected=0;
 await page.route('**/functions/nfcCards',async route=>{
   const body=route.request().postDataJSON();
   if(body.person_key==='user:needs2'){rejected++;return route.fulfill({status:503,json:{error:'Try again later'}});}
   return route.fallback();
 });
 await page.goto('/admin/plan-pickups');
 await page.getByRole('checkbox',{name:'Select Ned North',exact:true}).check();
 await page.getByRole('checkbox',{name:'Select Wes Wrong',exact:true}).check();
 await page.getByRole('button',{name:'Review assignments'}).click();
 await confirm(page,'Confirm assignments');
 await expect.poll(()=>rejected).toBe(1);
 await expect.poll(()=>calls.setBus.length).toBe(1);
 expect(calls.setBus[0].person_key).toBe('user:wrong');
 await expect(page.getByRole('checkbox',{name:'Select Ned North',exact:true})).toBeChecked();
 await expect(page.getByRole('button',{name:'Review assignments'})).toBeEnabled();
 await expect(page.getByText('1 selected',{exact:true})).toBeVisible();
});

