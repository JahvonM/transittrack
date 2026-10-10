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

test('passengers are sorted by whether their bus drives past their pickup',async({page})=>{
 await admin(page);
 await page.goto('/admin/plan-pickups');
 await expect(page.getByRole('heading',{name:'Needs a bus (2)'})).toBeVisible();
 await expect(page.getByRole('list',{name:'Needs a bus'})).toContainText('Nia Needs');
 await expect(page.getByRole('list',{name:'Wrong bus'})).toContainText('On Blue bus · pickup on Coastal');
 await expect(page.getByRole('region',{name:'New estate: waiting'})).toContainText('White bus passes 1.1 km away (Coastal)');
 await expect(page.getByRole('list',{name:'No route reaches them'})).toContainText('No bus passes within 1.5 km');
 await expect(page.getByRole('list',{name:'On the right bus'})).toContainText('Olu Okafor');
 await expect(page.getByRole('list',{name:'Seats on each bus'})).toContainText('19 / 20');
 // Both companies' passengers show until one company is picked.
 await expect(page.getByRole('list',{name:'No pickup yet'})).toContainText('Bea Bee');
 await page.getByRole('group',{name:'Company'}).getByRole('button',{name:'Company A'}).click();
 await expect(page.getByRole('list',{name:'No pickup yet'})).not.toContainText('Bea Bee');
 await shot(page,'plan-pickups');
 await page.setViewportSize({width:390,height:844});
 await expect(page.getByRole('list',{name:'Needs a bus'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await shot(page,'plan-pickups-phone');
});

test('nothing changes until the admin assigns, one at a time or all suggested',async({page})=>{
 const calls=await admin(page);
 await page.goto('/admin/plan-pickups');
 await expect(page.getByRole('heading',{name:'Needs a bus (2)'})).toBeVisible();
 expect(calls.setBus).toHaveLength(0);
 await page.getByRole('button',{name:'Assign Nia Needs to White bus'}).click();
 await expect.poll(()=>calls.setBus.length).toBe(1);
 expect(calls.setBus[0]).toEqual({action:'set_bus',person_key:'contact:needs',vehicle_id:'bus-1'});
 await expect(page.getByRole('heading',{name:'Needs a bus (1)'})).toBeVisible();
 await expect(page.getByRole('list',{name:'On the right bus'})).toContainText('Nia Needs');
 // Assign all: the one left who needs a bus and the one on the wrong bus.
 await page.getByRole('button',{name:'Assign all suggested (2)'}).click();
 await confirm(page,'Assign all');
 await expect.poll(()=>calls.setBus.length).toBe(3);
 expect(calls.setBus.slice(1).map(c=>[c.person_key,c.vehicle_id])).toEqual([['user:needs2','bus-2'],['user:wrong','bus-1']]);
 await expect(page.getByRole('heading',{name:'Wrong bus (0)'})).toBeVisible();
});

test('a route with no bus: put a bus on it, or use a bus that passes nearby',async({page})=>{
 const calls=await admin(page);
 await page.goto('/admin/plan-pickups');
 const group=page.getByRole('region',{name:'New estate: waiting'});
 // Only this company's buses can be put on the route.
 await expect(group.getByLabel('Bus for New estate').locator('option')).toHaveText(['Choose a bus…','White bus (now Coastal)','Blue bus (now Hills)','Spare van']);
 await group.getByLabel('Bus for New estate').selectOption('bus-3');
 await group.getByRole('button',{name:'Put bus on route'}).click();
 await confirm(page,'Put bus on route');
 await expect.poll(()=>calls.vehicle.length).toBe(1);
 expect(calls.vehicle[0]).toMatchObject({entity:'Vehicle',operation:'update',id:'bus-3',data:{route_id:'r3'}});
 // They now need a bus, and the van is suggested, but nobody is assigned yet.
 await expect(page.getByRole('list',{name:'Needs a bus'})).toContainText('Ella Estate');
 await expect(page.getByRole('button',{name:'Assign Ella Estate to Spare van'})).toBeVisible();
 expect(calls.setBus).toHaveLength(0);
});

test('use a nearby bus for someone whose route has none',async({page})=>{
 const calls=await admin(page);
 await page.goto('/admin/plan-pickups');
 const group=page.getByRole('region',{name:'New estate: waiting'});
 await group.getByRole('button',{name:'Use White bus'}).click();
 await expect.poll(()=>calls.setBus.length).toBe(1);
 expect(calls.setBus[0]).toMatchObject({person_key:'user:nobus',vehicle_id:'bus-1'});
 // On the bus now; it passes 1.1 km away, so their app asks them to pick again.
 await expect(group).toContainText('On White bus, which passes 1.1 km away. Their app asks them to pick a pickup on Coastal.');
 await expect(group.getByRole('button',{name:'Use White bus'})).toHaveCount(0);
});
