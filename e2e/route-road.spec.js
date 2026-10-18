import {test,expect} from '@playwright/test';

// Route Planner: draw the road a bus drives, with or without stops.
const SHOTS=process.env.TT_SHOT_DIR||'';
const shot=async(page,name)=>{ if(SHOTS) await page.screenshot({path:`${SHOTS}/${name}.png`}); };

async function planner(page){
 const saved=[];
 const routes=[{id:'route-a',name:'Coastal road',company_id:'a',company_name:'Company A',type:'staff',stops:[],
  path:[{lat:12.05,lng:-61.75},{lat:12.04,lng:-61.755},{lat:12.03,lng:-61.76}],path_via:[{lat:12.05,lng:-61.75},{lat:12.03,lng:-61.76}]}];
 await page.addInitScript(()=>{ localStorage.setItem('base44_access_token','mock-authenticated-session'); });
 await page.route('https://api.mapbox.com/**',r=>{
  const url=r.request().url();
  // Street snapping: the road goes straight through the tapped points.
  if(url.includes('/directions/v5/mapbox/driving/')){
   const coords=decodeURIComponent(url.split('/driving/')[1].split('?')[0]).split(';').map(c=>c.split(',').map(Number));
   return r.fulfill({json:{routes:[{geometry:{coordinates:coords},distance:1000,duration:120}]}});
  }
  // A plain background instead of map tiles (no internet in tests), so the drawn road shows.
  if(url.includes('/styles/v1/')) return r.fulfill({json:{version:8,sources:{},layers:[{id:'bg',type:'background',paint:{'background-color':'#0d1726'}}]}});
  return r.fulfill({status:404,body:''});
 });
 await page.route('**/api/**',async route=>{
  const url=route.request().url();
  if(url.includes('/functions/routeStops')) return route.fulfill({json:{has_road:true,merge_m:150,
   stops:[{key:'pickup:user:a',name:"Outside Joe's shop",lat:12.045,lng:-61.752,along:600,fixed:false,riders:[{id:'user:a',name:'Ann Lee',moved_m:0},{id:'user:b',name:'Ben Cole',moved_m:80}]},
          {key:'pickup:contact:c',name:'Pickup 1',lat:12.035,lng:-61.757,along:1800,fixed:false,riders:[{id:'contact:c',name:'Cara Diaz',moved_m:0}]}],
   off_road:[{id:'user:far',name:'Far Away'}]}});
  if(url.includes('/entities/User/me')) return route.fulfill({json:{id:'admin',role:'admin',email:'admin@test.local',full_name:'Ada Admin'}});
  if(url.includes('/functions/entityAccess')){
   const body=route.request().postDataJSON();let result=[];
   if(body.entity==='AdminBootstrap') return route.fulfill({json:{result:{datasets:Object.fromEntries((body.datasets||[]).map(key=>[key,key==='vehicles'?[{id:'bus-a',company_id:'a',name:'Bus A'}]:[]])),errors:{}}}});
   if(body.entity==='User'&&body.operation==='get') result={id:'admin',role:'admin',email:'admin@test.local',full_name:'Ada Admin'};
   else if(body.entity==='Route'&&(body.operation==='create'||body.operation==='update')){saved.push(body);result={id:body.id||'route-new',...body.data};}
   else if(body.entity==='Route') result=routes;
   else if(body.entity==='Company') result=[{id:'a',name:'Company A'}];
   else if(body.entity==='Workplace') result=[{id:'w',company_id:'a',name:'Coyaba Resort',lat:12.0,lng:-61.78}];
   return route.fulfill({json:{result}});
  }
  if(url.includes('/entities/')) return route.fulfill({json:[]});
  return route.fulfill({json:{id:'test-app',public_settings:{authentication_required:false}}});
 });
 return {saved};
}

test.use({viewport:{width:1440,height:900}});

test('a saved route shows its drawn road',async({page})=>{
 await planner(page);
 await page.goto('/admin/route-planner');
 await expect(page.getByRole('button',{name:/Coastal road/}).last()).toContainText('road drawn');
 await page.getByRole('button',{name:/Coastal road/}).last().click();
 const road=page.getByRole('region',{name:'Road',exact:true});
 await expect(road).toContainText('2.5 km');
 await expect(road).toContainText('drawn through 2 points');
 await expect(page.getByRole('region',{name:'Stops (0)'})).toContainText('Stops are optional on a drawn road');
});

test('a saved road lists its pickup stops in order, with merged neighbours',async({page})=>{
 const {saved}=await planner(page);
 await page.goto('/admin/route-planner');
 await page.getByRole('button',{name:/Coastal road/}).last().click();
 const list=page.getByRole('list',{name:'Pickup stops'});
 await expect(list.getByRole('listitem')).toHaveCount(2);
 await expect(list.getByRole('listitem').first()).toContainText("Outside Joe's shop");
 await expect(list.getByRole('listitem').first()).toContainText('Ann Lee, Ben Cole');
 await expect(page.getByText('Too far from this road:')).toBeVisible();
 await expect(page.getByLabel('Pickups closer than')).toHaveValue('150');
 await shot(page,'pickup-stops');
 await page.getByLabel('Pickups closer than').fill('80');
 await page.getByRole('button',{name:'Save changes',exact:true}).click();
 await expect.poll(()=>saved.length).toBe(1);
 expect(saved[0].data.pickup_merge_m).toBe(80);
});

test('draw a road by tapping the map, undo a point, and save it with no stops',async({page})=>{
 const {saved}=await planner(page);
 await page.goto('/admin/route-planner');
 const canvas=page.locator('.mapboxgl-canvas');
 await expect(canvas).toBeVisible({timeout:15000});
 await page.getByRole('group',{name:'Map taps add'}).getByRole('button',{name:'Road'}).click();
 await expect(page.getByText('Tap along the roads the bus drives, start to finish')).toBeVisible();
 const box=await canvas.boundingBox();
 for(const [x,y] of [[0.3,0.4],[0.45,0.5],[0.6,0.45],[0.7,0.6]]) await page.mouse.click(box.x+box.width*x,box.y+box.height*y);
 await expect(page.getByText(/drawn through 4 points/)).toBeVisible();
 await shot(page,'road-drawn');
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await expect(page.getByText(/drawn through 3 points/)).toBeVisible();
 await page.getByLabel('Route name').fill('North road');
 await page.locator('#rp-company').click();
 await page.getByRole('option',{name:'Company A'}).click();
 await page.getByRole('button',{name:'Create route',exact:true}).click();
 await expect.poll(()=>saved.length).toBe(1);
 const data=saved[0].data;
 expect(data.stops).toEqual([]);
 expect(data.path_via).toHaveLength(3);
 expect(data.path.length).toBeGreaterThanOrEqual(2);
 expect(data.path.every(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng))).toBe(true);
});
